<template>
  <yt-live-chat-membership-item-renderer
    show-only-header
    class="style-scope yt-live-chat-item-list-renderer"
    :privilegeType="privilegeType"
    :is-deleted="isDelete"
  >
    <div id="card" class="style-scope yt-live-chat-membership-item-renderer">
      <div id="header" class="style-scope yt-live-chat-membership-item-renderer">
        <img-shadow
          id="author-photo"
          height="40"
          width="40"
          class="style-scope yt-live-chat-membership-item-renderer"
          :imgUrl="avatarUrl"
        ></img-shadow>
        <div id="header-content" class="style-scope yt-live-chat-membership-item-renderer">
          <div
            id="header-content-primary-column"
            class="style-scope yt-live-chat-membership-item-renderer"
          >
            <div
              id="header-content-inner-column"
              class="style-scope yt-live-chat-membership-item-renderer"
            >
              <yt-live-chat-author-chip class="style-scope yt-live-chat-membership-item-renderer"
                ><span
                  id="author-name"
                  dir="auto"
                  class="member style-scope yt-live-chat-author-chip"
                  >{{ authorName
                  }}<span
                    id="chip-badges"
                    class="style-scope yt-live-chat-author-chip"
                  ></span></span
                ><span id="chat-badges" class="style-scope yt-live-chat-author-chip"
                  ><author-badge
                    class="style-scope yt-live-chat-author-chip"
                    :isAdmin="false"
                    :privilegeType="privilegeType" /></span
              ></yt-live-chat-author-chip>
            </div>
            <div id="header-subtext" class="style-scope yt-live-chat-membership-item-renderer" v-text="title"></div>
          </div>
          <div id="timestamp" class="style-scope yt-live-chat-membership-item-renderer" v-text="timeText"></div>
        </div>
      </div>
    </div>
  </yt-live-chat-membership-item-renderer>
</template>

<script>
import ImgShadow from './ImgShadow'
import AuthorBadge from './AuthorBadge'
import * as utils from '@/utils'

export default {
  name: 'MembershipItem',
  components: {
    ImgShadow,
    AuthorBadge,
  },
  props: {
    avatarUrl: String,
    authorName: String,
    privilegeType: Number,
    title: String,
    time: Date,
    isDelete: Boolean,
  },
  computed: {
    timeText() {
      return utils.getTimeTextHourMin(this.time)
    },
  },
}
</script>

<style src="@/assets/css/youtube/yt-live-chat-membership-item-renderer.css"></style>
