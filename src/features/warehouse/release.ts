export const localWarehouseEnabled = (import.meta.env.DEV && import.meta.env.MODE === 'local-crm') || import.meta.env.VITE_CLOUD_MODULES === 'enabled'
