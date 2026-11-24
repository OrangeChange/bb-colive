<template>
  <yt-live-chat-text-message-renderer
    :style="{ '--repeated-text-color': randomColor }"
    :is-fan-group="isFanGroup"
    :medal-level="medalLevel"
    :author-type="authorTypeText"
    :privilegeType="privilegeType"
    :is-admin="authorType === 2"
    :is-owner="authorType === 3"
    :is-deleted="isDelete"
  >
    <div id="card" class="style-scope yt-live-chat-text-message-renderer">
      <img-shadow
        id="author-photo"
        height="24"
        width="24"
        class="style-scope yt-live-chat-text-message-renderer"
        :imgUrl="avatarUrl"
      />
      <div id="content" class="style-scope yt-live-chat-text-message-renderer">
        <yt-live-chat-author-chip class="style-scope yt-live-chat-text-message-renderer">
          <span id="timestamp" class="style-scope yt-live-chat-text-message-renderer" v-text="timeText"></span>
          <span
            id="author-name"
            dir="auto"
            class="style-scope yt-live-chat-author-chip"
            :type="authorTypeText"
            >{{ authorName
            }}<span id="chip-badges" class="style-scope yt-live-chat-author-chip"></span
          ></span>
          <span id="chat-medal" class="style-scope yt-live-chat-author-chip"
            ><author-medal
              class="style-scope yt-live-chat-author-chip"
              :medalLevel="medalLevel"
              :medalName="medalName"
              :isFanGroup="isFanGroup"
              :isCurrentRoom="isCurrentRoom"
          /></span>
          <span id="chat-badges" class="style-scope yt-live-chat-author-chip"
            ><author-badge
              class="style-scope yt-live-chat-author-chip"
              :isAdmin="authorType === 2"
              :privilegeType="privilegeType"
          /></span>
        </yt-live-chat-author-chip>
        <div
          v-if="!emoticon"
          id="image-and-message"
          class="style-scope yt-live-chat-text-message-renderer"
        >
          <template v-for="(part, index) in richTranslate">
            <span
              v-if="part.type === CONTENT_TYPE_TEXT"
              id="message"
              :key="'translation-text-' + index"
              >{{ part.text }}</span
            >
            <img
              v-else-if="part.type === CONTENT_TYPE_IMAGE"
              :key="'translation-image-' + index"
              class="emoji yt-formatted-string style-scope yt-live-chat-text-message-renderer"
              :src="part.url"
              :alt="part.text"
              :shared-tooltip-text="part.text"
              :id="'emoji-' + index + '+translate'"
            />
          </template>
          <template v-if="onlyShowTranslate === false">
            <template v-for="(part, index) in richContent">
              <span v-if="index === 0 && translateActive === true" :key="'open-' + index">(</span>
              <span v-if="part.type === CONTENT_TYPE_TEXT" id="message" :key="'text-' + index">{{
                part.text
              }}</span>
              <img
                v-else-if="part.type === CONTENT_TYPE_IMAGE"
                :key="'image-' + index"
                class="emoji yt-formatted-string style-scope yt-live-chat-text-message-renderer"
                :src="part.url"
                :alt="part.text"
                :shared-tooltip-text="part.text"
                :id="'emoji-' + part.text"
              />
              <span
                v-if="index === richContent.length - 1 && translateActive === true"
                :key="'close-' + index"
                >)</span
              >
            </template>
          </template>
          <el-badge
            :value="repeated"
            :max="99"
            v-show="repeated > 1"
            class="style-scope yt-live-chat-text-message-renderer"
            :style="{ '--repeated-mark-color': repeatedMarkColor }"
          />
        </div>
        <div v-else id="image-and-message" class="style-scope yt-live-chat-text-message-renderer">
          <img id="emoticon" :src="emoticon" :width="emoticonSize" />
        </div>
      </div>
    </div>
  </yt-live-chat-text-message-renderer>
</template>

<script>
import ImgShadow from './ImgShadow'
import AuthorMedal from './AuthorMedal'
import AuthorBadge from './AuthorBadge'
import * as constants from './constants'
import * as utils from '@/utils'

// HSL
const RANDOM_TEXT_COLOR_START = [0, 100.0, 55.0]
const RANDOM_TEXT_COLOR_END = [360, 60.0, 75.0]

const REPEATED_MARK_COLOR_START = [210, 100.0, 62.5]
const REPEATED_MARK_COLOR_END = [360, 87.3, 69.2]

export default {
  name: 'TextMessage',
  data() {
    return {
      CONTENT_TYPE_TEXT: constants.CONTENT_TYPE_TEXT,
      CONTENT_TYPE_IMAGE: constants.CONTENT_TYPE_IMAGE,
    }
  },
  components: {
    ImgShadow,
    AuthorMedal,
    AuthorBadge,
  },
  props: {
    avatarUrl: String,
    time: Date,
    authorName: String,
    authorType: Number,
    medalName: String,
    medalLevel: Number,
    isFanGroup: { type: Boolean, default: undefined },
    isCurrentRoom: { type: Boolean, default: undefined },
    emoticonSize: { type: Number, default: 80 },
    richContent: Array,
    richTranslate: Array,
    showTranslateDanmakuOnly: Boolean,
    translateActive: Boolean,
    onlyShowTranslate: { type: Boolean, default: false },
    isDelete: Boolean,
    emoticon: String,
    privilegeType: Number,
    repeated: Number,
  },
  computed: {
    timeText() {
      return utils.getTimeTextHourMin(this.time)
    },
    authorTypeText() {
      // 优先判断舰长
      return this.privilegeType > 0 ? 'member' : constants.AUTHOR_TYPE_TO_TEXT[this.authorType]
    },
    randomColor() {
      let color = [0, 0, 0]
      let t = Math.random()
      for (let i = 0; i < 3; i++) {
        color[i] =
          RANDOM_TEXT_COLOR_START[i] + (RANDOM_TEXT_COLOR_END[i] - REPEATED_MARK_COLOR_START[i]) * t
      }
      return `hsl(${color[0]}, ${color[1]}%, ${color[2]}%)`
    },

    repeatedMarkColor() {
      let color
      if (this.repeated <= 2) {
        color = REPEATED_MARK_COLOR_START
      } else if (this.repeated >= 10) {
        color = REPEATED_MARK_COLOR_END
      } else {
        color = [0, 0, 0]
        let t = (this.repeated - 2) / (10 - 2)
        for (let i = 0; i < 3; i++) {
          color[i] =
            REPEATED_MARK_COLOR_START[i] +
            (REPEATED_MARK_COLOR_END[i] - REPEATED_MARK_COLOR_START[i]) * t
        }
      }
      return `hsl(${color[0]}, ${color[1]}%, ${color[2]}%)`
    },
  },
}
</script>

<style>
yt-live-chat-text-message-renderer > #card > #content .el-badge {
  margin-left: 10px;
}

yt-live-chat-text-message-renderer > #card > #content .el-badge .el-badge__content {
  font-size: 12px !important;
  line-height: 18px !important;
  text-shadow: none !important;
  font-family: sans-serif !important;
  color: #fff !important;
  background-color: var(--repeated-mark-color) !important;
  border: none;
}
</style>

<style src="@/assets/css/youtube/yt-live-chat-text-message-renderer.css"></style>
