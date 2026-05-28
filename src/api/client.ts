import { createAlova } from 'alova'
import adapterFetch from 'alova/fetch'
import VueHook from 'alova/vue'
import { createAppConfig } from '~/app/config'

const { apiBaseUrl } = createAppConfig()

export const alovaClient = createAlova({
  baseURL: apiBaseUrl,
  requestAdapter: adapterFetch(),
  responded(response: Response) {
    return response.json()
  },
  statesHook: VueHook,
  timeout: 10000,
})
