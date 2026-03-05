<script setup lang="ts">
/**
 * CacheDialog 组件 - 缓存书架弹窗
 *
 * 功能流程:
 *
 * onMounted()
 *     |
 *     +-> db.getAllBooks()
 *     |       |
 *     |       v
 *     |   加载书籍列表到 books
 *     |
 *     +-> getCoverUrl() 为每个封面创建 URL
 *
 * 用户交互:
 *     点击卡片 -> selectBook() -> emit('select', bookId)
 *     点击删除 -> deleteBook() -> 从列表移除
 *     点击清空 -> clearAll() -> 清空所有缓存
 */
import { ref, onMounted, computed, onUnmounted } from 'vue'
import { db, type BookInfo } from '../utils/db'
import { Dialog, Notify } from 'quasar'

const emit = defineEmits<{
  (e: 'select', bookId: string): void
  (e: 'close'): void
}>()

const books = ref<BookInfo[]>([])
const loading = ref(true)
const coverUrls = ref<Map<string, string>>(new Map())

// 加载书籍列表
onMounted(async () => {
  await loadBooks()
})

// 组件销毁时释放 URL
onUnmounted(() => {
  coverUrls.value.forEach((url) => {
    URL.revokeObjectURL(url)
  })
})

// 加载书籍列表
async function loadBooks() {
  loading.value = true
  try {
    books.value = await db.getAllBooks()
    // 为每个封面创建 URL
    books.value.forEach((book) => {
      if (book.coverFile) {
        const url = URL.createObjectURL(book.coverFile)
        coverUrls.value.set(book.id, url)
      }
    })
  } catch (error) {
    console.error('[CacheDialog] 加载书籍列表失败:', error)
    Notify.create({
      type: 'negative',
      message: '加载缓存列表失败',
      position: 'top'
    })
  } finally {
    loading.value = false
  }
}

// 获取封面 URL
function getCoverUrl(bookId: string): string {
  return coverUrls.value.get(bookId) || ''
}

// 选择书籍
async function selectBook(bookId: string) {
  emit('select', bookId)
}

// 删除书籍
async function deleteBook(bookId: string, event: Event) {
  event.stopPropagation() // 阻止触发 selectBook

  Dialog.create({
    title: '确认删除',
    message: `确定要删除 "${bookId}" 吗?`,
    cancel: {
      label: '取消',
      flat: true,
      color: 'grey'
    },
    ok: {
      label: '删除',
      flat: true,
      color: 'negative'
    },
    persistent: true
  }).onOk(async () => {
    try {
      await db.deleteBook(bookId)
      // 释放封面 URL
      const url = coverUrls.value.get(bookId)
      if (url) {
        URL.revokeObjectURL(url)
        coverUrls.value.delete(bookId)
      }
      // 从列表中移除
      books.value = books.value.filter((b) => b.id !== bookId)
      Notify.create({
        type: 'positive',
        message: '删除成功',
        position: 'top'
      })
    } catch (error) {
      console.error('[CacheDialog] 删除书籍失败:', error)
      Notify.create({
        type: 'negative',
        message: '删除失败',
        position: 'top'
      })
    }
  })
}

// 清空所有缓存
async function clearAll() {
  Dialog.create({
    title: '确认清空',
    message: '确定要清空所有缓存吗? 此操作不可恢复!',
    cancel: {
      label: '取消',
      flat: true,
      color: 'grey'
    },
    ok: {
      label: '清空',
      flat: true,
      color: 'negative'
    },
    persistent: true
  }).onOk(async () => {
    try {
      await db.clearAll()
      // 释放所有封面 URL
      coverUrls.value.forEach((url) => {
        URL.revokeObjectURL(url)
      })
      coverUrls.value.clear()
      books.value = []
      Notify.create({
        type: 'positive',
        message: '缓存已清空',
        position: 'top'
      })
    } catch (error) {
      console.error('[CacheDialog] 清空缓存失败:', error)
      Notify.create({
        type: 'negative',
        message: '清空失败',
        position: 'top'
      })
    }
  })
}

// 关闭弹窗
function closeDialog() {
  emit('close')
}

const hasBooks = computed(() => books.value.length > 0)
</script>

<template>
  <q-dialog :model-value="true" persistent @hide="closeDialog">
    <div class="cache-dialog">
      <!-- 头部 -->
      <div class="dialog-header">
        <span class="title">缓存书架</span>
        <q-btn flat round dense icon="close" color="grey-5" @click="closeDialog" />
      </div>

      <!-- 内容区域 -->
      <div class="dialog-content">
        <!-- 加载中 -->
        <div v-if="loading" class="loading-container">
          <q-spinner color="primary" size="48px" />
          <span>加载中...</span>
        </div>

        <!-- 空状态 -->
        <div v-else-if="!hasBooks" class="empty-state">
          <q-icon name="folder_off" size="64px" color="grey-6" />
          <span>暂无缓存书籍</span>
        </div>

        <!-- 书籍网格 -->
        <div v-else class="books-grid">
          <div
            v-for="book in books"
            :key="book.id"
            class="book-card"
            @click="selectBook(book.id)"
          >
            <!-- 封面 -->
            <div class="cover-wrapper">
              <img
                v-if="getCoverUrl(book.id)"
                :src="getCoverUrl(book.id)"
                :alt="book.id"
                class="cover-image"
              />
              <div v-else class="cover-placeholder">
                <q-icon name="menu_book" size="48px" color="grey-6" />
              </div>
              <!-- 删除按钮 -->
              <q-btn
                class="delete-btn"
                flat
                round
                dense
                icon="delete"
                color="negative"
                size="sm"
                @click="deleteBook(book.id, $event)"
              />
            </div>
            <!-- 书名 -->
            <div class="book-title" :title="book.id">
              {{ book.id }}
            </div>
          </div>
        </div>
      </div>

      <!-- 底部 -->
      <div v-if="hasBooks" class="dialog-footer">
        <span class="book-count">共 {{ books.length }} 本</span>
        <q-btn
          flat
          label="清空所有缓存"
          color="negative"
          icon="delete_sweep"
          @click="clearAll"
        />
      </div>
    </div>
  </q-dialog>
</template>

<style lang="scss" scoped>
.cache-dialog {
  width: 90vw;
  max-width: 900px;
  max-height: 85vh;
  background-color: #1d1d1d;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background-color: #2d2d2d;
  border-bottom: 1px solid #3d3d3d;

  .title {
    font-size: 18px;
    font-weight: 500;
    color: #ffffff;
  }
}

.dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  gap: 16px;
  color: #9e9e9e;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  gap: 16px;
  color: #9e9e9e;
}

.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
}

.book-card {
  cursor: pointer;
  transition: transform 0.2s ease;

  &:hover {
    transform: scale(1.05);

    .delete-btn {
      opacity: 1;
    }
  }
}

.cover-wrapper {
  position: relative;
  width: 100%;
  padding-bottom: 133.33%; // 3:4 比例
  border-radius: 8px;
  overflow: hidden;
  background-color: #2d2d2d;
}

.cover-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #2d2d2d;
}

.delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  opacity: 0;
  transition: opacity 0.2s ease;
  background-color: rgba(0, 0, 0, 0.6);

  &:hover {
    background-color: rgba(0, 0, 0, 0.8);
  }
}

.book-title {
  margin-top: 8px;
  font-size: 13px;
  color: #e0e0e0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background-color: #2d2d2d;
  border-top: 1px solid #3d3d3d;

  .book-count {
    font-size: 14px;
    color: #9e9e9e;
  }
}
</style>
