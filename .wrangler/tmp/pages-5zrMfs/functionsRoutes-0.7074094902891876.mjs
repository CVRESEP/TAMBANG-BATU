import { onRequestPost as __api_auth_js_onRequestPost } from "E:\\PROJECT\\website\\functions\\api\\auth.js"
import { onRequestDelete as __api_sync_js_onRequestDelete } from "E:\\PROJECT\\website\\functions\\api\\sync.js"
import { onRequestGet as __api_sync_js_onRequestGet } from "E:\\PROJECT\\website\\functions\\api\\sync.js"
import { onRequestPost as __api_sync_js_onRequestPost } from "E:\\PROJECT\\website\\functions\\api\\sync.js"

export const routes = [
    {
      routePath: "/api/auth",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_auth_js_onRequestPost],
    },
  {
      routePath: "/api/sync",
      mountPath: "/api",
      method: "DELETE",
      middlewares: [],
      modules: [__api_sync_js_onRequestDelete],
    },
  {
      routePath: "/api/sync",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_sync_js_onRequestGet],
    },
  {
      routePath: "/api/sync",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_sync_js_onRequestPost],
    },
  ]