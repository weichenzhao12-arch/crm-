CREATE TABLE sample_skus (
  id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL,
  specification TEXT NOT NULL,
  location TEXT NOT NULL,
  reorder_at INTEGER NOT NULL DEFAULT 0 CHECK (reorder_at >= 0),
  on_hand INTEGER NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved BETWEEN 0 AND on_hand),
  UNIQUE (product_id, specification, location)
);

CREATE TABLE sample_documents (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('receipt', 'issue', 'return', 'reversal')),
  customer_id TEXT,
  customer_name TEXT,
  original_document_id TEXT REFERENCES sample_documents(id),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (kind <> 'issue' OR length(trim(coalesce(customer_name, ''))) > 0),
  CHECK (kind NOT IN ('return', 'reversal') OR original_document_id IS NOT NULL)
);

CREATE TABLE sample_document_lines (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL REFERENCES sample_documents(id),
  sku_id TEXT NOT NULL REFERENCES sample_skus(id),
  product_snapshot TEXT NOT NULL CHECK (json_valid(product_snapshot)),
  quantity INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity > 0),
  UNIQUE (document_id, sku_id)
);

CREATE TABLE sample_movements (
  line_id TEXT NOT NULL REFERENCES sample_document_lines(id),
  action TEXT NOT NULL CHECK (action IN ('receive', 'reserve', 'release', 'issue', 'direct_issue', 'return', 'reverse_receipt')),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (line_id, action)
);

CREATE TRIGGER sample_movement_guard BEFORE INSERT ON sample_movements
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM sample_document_lines l JOIN sample_documents d ON d.id = l.document_id
    WHERE l.id = NEW.line_id AND (
      (d.kind = 'receipt' AND NEW.action = 'receive')
      OR (d.kind = 'issue' AND (
        (NEW.action IN ('reserve', 'direct_issue') AND NOT EXISTS (
          SELECT 1 FROM sample_movements WHERE line_id = l.id
        ))
        OR (NEW.action IN ('release', 'issue') AND EXISTS (
          SELECT 1 FROM sample_movements WHERE line_id = l.id AND action = 'reserve'
        ) AND NOT EXISTS (
          SELECT 1 FROM sample_movements WHERE line_id = l.id AND action IN ('issue', 'release')
        ))
      ))
      OR (d.kind IN ('return', 'reversal') AND EXISTS (
        SELECT 1 FROM sample_document_lines original
        JOIN sample_movements posted ON posted.line_id = original.id
        WHERE original.document_id = d.original_document_id AND original.sku_id = l.sku_id
          AND ((NEW.action = 'return' AND posted.action IN ('issue', 'direct_issue'))
            OR (NEW.action = 'reverse_receipt' AND d.kind = 'reversal' AND posted.action = 'receive'))
          AND l.quantity + coalesce((
            SELECT sum(previous.quantity) FROM sample_document_lines previous
            JOIN sample_documents parent ON parent.id = previous.document_id
            JOIN sample_movements movement ON movement.line_id = previous.id
            WHERE parent.original_document_id = d.original_document_id
              AND previous.sku_id = l.sku_id AND movement.action = NEW.action
          ), 0) <= original.quantity
      ))
    )
  ) THEN RAISE(ABORT, 'invalid sample movement') END;
END;

CREATE TRIGGER sample_movement_balance AFTER INSERT ON sample_movements
BEGIN
  UPDATE sample_skus SET
    on_hand = on_hand + (SELECT quantity FROM sample_document_lines WHERE id = NEW.line_id) *
      CASE WHEN NEW.action IN ('receive', 'return') THEN 1
           WHEN NEW.action IN ('issue', 'direct_issue', 'reverse_receipt') THEN -1 ELSE 0 END,
    reserved = reserved + (SELECT quantity FROM sample_document_lines WHERE id = NEW.line_id) *
      CASE WHEN NEW.action = 'reserve' THEN 1
           WHEN NEW.action IN ('issue', 'release') THEN -1 ELSE 0 END
  WHERE id = (SELECT sku_id FROM sample_document_lines WHERE id = NEW.line_id);
END;

CREATE TRIGGER sample_line_frozen BEFORE UPDATE ON sample_document_lines
WHEN EXISTS (SELECT 1 FROM sample_movements WHERE line_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'posted sample line is immutable');
END;

CREATE VIEW sample_availability AS
SELECT *, on_hand - reserved AS available,
  on_hand - reserved <= reorder_at AS needs_restock
FROM sample_skus;

CREATE TRIGGER sample_movement_no_update BEFORE UPDATE ON sample_movements
BEGIN
  SELECT RAISE(ABORT, 'sample movement is immutable');
END;

CREATE TRIGGER sample_movement_no_delete BEFORE DELETE ON sample_movements
BEGIN
  SELECT RAISE(ABORT, 'sample movement is immutable');
END;

CREATE TRIGGER sample_document_frozen BEFORE UPDATE ON sample_documents
WHEN EXISTS (
  SELECT 1 FROM sample_document_lines l JOIN sample_movements m ON m.line_id = l.id
  WHERE l.document_id = OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'posted sample document is immutable');
END;
