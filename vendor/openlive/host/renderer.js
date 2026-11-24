import Vue from 'vue'
import Badge from 'element-ui/lib/badge'
import Tooltip from 'element-ui/lib/tooltip'
import 'element-ui/lib/theme-chalk/badge.css'
import 'element-ui/lib/theme-chalk/tooltip.css'
import '../frontend/src/assets/css/youtube/yt-live-chat-author-chip.css'
import ChatRenderer from '../frontend/src/components/ChatRenderer/index.vue'
import '../frontend/src/assets/css/youtube/yt-html.css'
import '../frontend/src/assets/css/youtube/yt-icon.css'
import './compat.css'
Vue.component('ElBadge', Badge.default)
Vue.component('ElTooltip', Tooltip.default)
Vue.config.ignoredElements = [/^yt-/]
window.OpenLiveSource = { Vue, xl: ChatRenderer }
