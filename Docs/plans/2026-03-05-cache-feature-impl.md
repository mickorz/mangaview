# MangaView 缓存功能实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 MangaView 添加书籍缓存和阅读进度记录功能，实现启动时恢复上次阅读状态。

**Architecture:** 使用 IndexedDB 存储 File 对象和阅读进度，启动时检测缓存并弹窗显示历史书架，用户选择后加载书籍并跳转到记录的页码。

**Tech Stack:** Vue 3, TypeScript, IndexedDB, Quasar Dialog

---

## Task 1: 创建 IndexedDB 封装类

**Files:**
- Create: `src/utils/db.ts`

**Step 1: 创建 db.ts 文件**

```typescript
// src/utils/db.ts

const DB_NAME = 'MangaViewCache'
const DB_VERSION = 1

export interface BookRecord {
  id: string
  files: File[]
  createdAt: number
  updatedAt: number
}

export interface ProgressRecord {
  bookId: string
  pageIndex: number
  lastReadAt: number
}

export interface BookInfo {
  id: string
  fileCount: number
  coverFile: File | null
  updatedAt: number
  lastReadAt: number
  pageIndex: number
}

class MangaViewDB {
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error('[DB] 打开数据库失败')
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        console.log('[DB] 数据库连接成功')
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // 创建 books store
        if (!db.objectStoreNames.contains('books')) {
          db.createObjectStore('books', { keyPath: 'id' })
        }

        // 创建 progress store
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'bookId' })
        }

        console.log('[DB] 数据库初始化完成')
      }
    })
  }

  private ensureDb(): IDBDatabase {
    if (!this.db) {
      throw new Error('[DB] 数据库未初始化')
    }
    return this.db
  }

  async saveBook(name: string, files: File[]): Promise<void> {
    const db = this.ensureDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['books'], 'readwrite')
      const store = tx.objectStore('books')

      const record: BookRecord = {
        id: name,
        files,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      const request = store.put(record)

      request.onsuccess = () => {
        console.log(`[DB] 保存书籍成功: ${name}`)
        resolve()
      }

      request.onerror = () => {
        console.error(`[DB] 保存书籍失败: ${name}`)
        reject(request.error)
      }
    })
  }

  async getBook(name: string): Promise<File[] | null> {
    const db = this.ensureDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['books'], 'readonly')
      const store = tx.objectStore('books')
      const request = store.get(name)

      request.onsuccess = () => {
        const record = request.result as BookRecord | undefined
        resolve(record ? record.files : null)
      }

      request.onerror = () => {
        reject(request.error)
      }
    })
  }

  async getAllBooks(): Promise<BookInfo[]> {
    const db = this.ensureDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['books', 'progress'], 'readonly')
      const booksStore = tx.objectStore('books')
      const progressStore = tx.objectStore('progress')

      const booksRequest = booksStore.getAll()
      const progressMap = new Map<string, ProgressRecord>()

      booksRequest.onsuccess = () => {
        const books = booksRequest.result as BookRecord[]

        // 获取所有进度
        const progressRequest = progressStore.getAll()
        progressRequest.onsuccess = () => {
          const progresses = progressRequest.result as ProgressRecord[]
          progresses.forEach(p => progressMap.set(p.bookId, p))

          const bookInfos: BookInfo[] = books.map(book => {
            const progress = progressMap.get(book.id)
            return {
              id: book.id,
              fileCount: book.files.length,
              coverFile: book.files[0] || null,
              updatedAt: book.updatedAt,
              lastReadAt: progress?.lastReadAt || book.updatedAt,
              pageIndex: progress?.pageIndex || 0
            }
          })

          // 按最后阅读时间排序
          bookInfos.sort((a, b) => b.lastReadAt - a.lastReadAt)
          resolve(bookInfos)
        }

        progressRequest.onerror = () => {
          reject(progressRequest.error)
        }
      }

      booksRequest.onerror = () => {
        reject(booksRequest.error)
      }
    })
  }

  async deleteBook(name: string): Promise<void> {
    const db = this.ensureDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['books', 'progress'], 'readwrite')
      const booksStore = tx.objectStore('books')
      const progressStore = tx.objectStore('progress')

      const bookRequest = booksStore.delete(name)
      const progressRequest = progressStore.delete(name)

      let bookDone = false
      let progressDone = false

      const checkDone = () => {
        if (bookDone && progressDone) {
          console.log(`[DB] 删除书籍成功: ${name}`)
          resolve()
        }
      }

      bookRequest.onsuccess = () => {
        bookDone = true
        checkDone()
      }

      progressRequest.onsuccess = () => {
        progressDone = true
        checkDone()
      }

      bookRequest.onerror = () => reject(bookRequest.error)
      progressRequest.onerror = () => reject(progressRequest.error)
    })
  }

  async clearAll(): Promise<void> {
    const db = this.ensureDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['books', 'progress'], 'readwrite')
      const booksStore = tx.objectStore('books')
      const progressStore = tx.objectStore('progress')

      const booksRequest = booksStore.clear()
      const progressRequest = progressStore.clear()

      let booksDone = false
      let progressDone = false

      const checkDone = () => {
        if (booksDone && progressDone) {
          console.log('[DB] 清空所有缓存成功')
          resolve()
        }
      }

      booksRequest.onsuccess = () => {
        booksDone = true
        checkDone()
      }

      progressRequest.onsuccess = () => {
        progressDone = true
        checkDone()
      }

      booksRequest.onerror = () => reject(booksRequest.error)
      progressRequest.onerror = () => reject(progressRequest.error)
    })
  }

  async saveProgress(bookId: string, pageIndex: number): Promise<void> {
    const db = this.ensureDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['progress'], 'readwrite')
      const store = tx.objectStore('progress')

      const record: ProgressRecord = {
        bookId,
        pageIndex,
        lastReadAt: Date.now()
      }

      const request = store.put(record)

      request.onsuccess = () => {
        resolve()
      }

      request.onerror = () => {
        console.error(`[DB] 保存进度失败: ${bookId}`)
        reject(request.error)
      }
    })
  }

  async getProgress(bookId: string): Promise<number> {
    const db = this.ensureDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['progress'], 'readonly')
      const store = tx.objectStore('progress')
      const request = store.get(bookId)

      request.onsuccess = () => {
        const record = request.result as ProgressRecord | undefined
        resolve(record ? record.pageIndex : 0)
      }

      request.onerror = () => {
        reject(request.error)
      }
    })
  }

  async hasAnyCache(): Promise<boolean> {
    const db = this.ensureDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['books'], 'readonly')
      const store = tx.objectStore('books')
      const request = store.count()

      request.onsuccess = () => {
        resolve(request.result > 0)
      }

      request.onerror = () => {
        reject(request.error)
      }
    })
  }
}

// 单例导出
export const db = new MangaViewDB()
```

**Step 2: 验证文件创建**

```bash
ls src/utils/db.ts
```

**Step 3: Commit**

```bash
git add src/utils/db.ts
git commit -m "feat: add IndexedDB wrapper for cache storage"
```

---

## Task 2: 创建缓存书架弹窗组件

**Files:**
- Create: `src/components/CacheDialog.vue`

**Step 1: 创建 CacheDialog.vue 组件**

```vue
<!-- src/components/CacheDialog.vue -->

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { db, type BookInfo } from '../utils/db'

const emit = defineEmits<{
  (e: 'select', bookId: string): void
  (e: 'close'): void
}>()

const books = ref<BookInfo[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    books.value = await db.getAllBooks()
  } catch (err) {
    console.error('[CacheDialog] 加载缓存失败', err)
  } finally {
    loading.value = false
  }
})

function getCoverUrl(file: File | null): string {
  if (!file) return ''
  return URL.createObjectURL(file)
}

async function selectBook(bookId: string) {
  emit('select', bookId)
}

async function deleteBook(bookId: string, event: Event) {
  event.stopPropagation()
  try {
    await db.deleteBook(bookId)
    books.value = books.value.filter(b => b.id !== bookId)
    if (books.value.length === 0) {
      emit('close')
    }
  } catch (err) {
    console.error('[CacheDialog] 删除失败', err)
  }
}

async function clearAll() {
  try {
    await db.clearAll()
    books.value = []
    emit('close')
  } catch (err) {
    console.error('[CacheDialog] 清空失败', err)
  }
}

const hasBooks = computed(() => books.value.length > 0)
</script>

<template>
  <q-dialog :model-value="true" persistent>
    <q-card class="cache-dialog">
      <q-card-section class="row items-center q-pb-none dialog-header">
        <div class="text-h6">历史记录</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup @click="$emit('close')" />
      </q-card-section>

      <q-card-section class="q-pt-none">
        <div v-if="loading" class="text-center q-pa-lg">
          <q-spinner size="40px" color="primary" />
        </div>

        <div v-else-if="!hasBooks" class="text-center text-grey q-pa-lg">
          暂无缓存记录
        </div>

        <div v-else class="books-grid">
          <q-card
            v-for="book in books"
            :key="book.id"
            class="book-card"
            flat
            clickable
            @click="selectBook(book.id)"
          >
            <div class="book-cover">
              <img :src="getCoverUrl(book.coverFile)" :alt="book.id" />
              <div class="delete-btn" @click="deleteBook(book.id, $event)">
                <q-icon name="close" />
              </div>
            </div>
            <q-card-section class="book-title">
              <div class="ellipsis">{{ book.id }}</div>
            </q-card-section>
          </q-card>
        </div>
      </q-card-section>

      <q-card-actions v-if="hasBooks" align="center" class="q-pb-md">
        <q-btn flat color="negative" label="清空所有缓存" @click="clearAll" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style lang="scss" scoped>
.cache-dialog {
  min-width: 400px;
  max-width: 90vw;
  max-height: 80vh;
  background: #1d1d1d;
  color: #fff;
}

.dialog-header {
  background: #2d2d2d;
}

.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
  padding: 8px;
  max-height: 60vh;
  overflow-y: auto;
}

.book-card {
  background: #2d2d2d;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);

    .delete-btn {
      opacity: 1;
    }
  }
}

.book-cover {
  position: relative;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  background: #1a1a1a;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .delete-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
    cursor: pointer;

    &:hover {
      background: rgba(255, 0, 0, 0.6);
    }

    .q-icon {
      font-size: 14px;
    }
  }
}

.book-title {
  padding: 8px;
  text-align: center;
  font-size: 12px;
}
</style>
```

**Step 2: 验证文件创建**

```bash
ls src/components/CacheDialog.vue
```

**Step 3: Commit**

```bash
git add src/components/CacheDialog.vue
git commit -m "feat: add CacheDialog component for cached books"
```

---

## Task 3: 修改 App.vue 集成缓存功能

**Files:**
- Modify: `src/App.vue`

**Step 1: 添加导入和初始化代码**

在 `<script setup>` 开头添加：

```typescript
import { db } from './utils/db'
import CacheDialog from './components/CacheDialog.vue'
```

**Step 2: 添加缓存相关状态变量**

在现有 ref 变量之后添加：

```typescript
// 缓存相关状态
let showCacheDialog = ref(false)
let cacheInitialized = ref(false)

// 当前可见的图片索引（用于计算页码）
let currentVisibleIndex = ref(0)
```

**Step 3: 添加防抖保存进度的函数**

```typescript
// 防抖保存进度
let saveProgressTimer: number | null = null

function debouncedSaveProgress() {
  if (saveProgressTimer) {
    clearTimeout(saveProgressTimer)
  }
  saveProgressTimer = window.setTimeout(async () => {
    if (tab.value && tab.value !== default_book) {
      try {
        await db.saveProgress(tab.value, currentVisibleIndex.value)
      } catch (err) {
        console.error('[App] 保存进度失败', err)
      }
    }
    saveProgressTimer = null
  }, 500)
}
```

**Step 4: 添加计算当前可见图片索引的函数**

```typescript
// 计算当前可见的图片索引
function updateVisibleIndex() {
  if (!scrollArea) return

  const images = scrollArea.querySelectorAll('img')
  const viewportHeight = scrollArea.clientHeight
  const viewportCenter = scrollArea.scrollTop + viewportHeight / 2

  let closestIndex = 0
  let closestDistance = Infinity

  images.forEach((img, index) => {
    const rect = img.getBoundingClientRect()
    const imgCenter = rect.top + rect.height / 2
    const distance = Math.abs(imgCenter - viewportHeight / 2)

    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = index
    }
  })

  currentVisibleIndex.value = closestIndex
}
```

**Step 5: 修改 onDrop 函数，添加保存到 IndexedDB 的逻辑**

找到 `onDrop` 函数，在 `folders.value = {...newFolders, ...oldFolders}` 之后添加：

```typescript
// 保存到 IndexedDB
try {
  for (const bookName in newFolders) {
    const bookFiles = Object.values(newFolders[bookName]) as File[]
    await db.saveBook(bookName, bookFiles)
  }
} catch (err) {
  console.error('[App] 保存书籍到缓存失败', err)
}
```

**Step 6: 修改 removeBook 函数，添加删除缓存的逻辑**

在 `delete folders.value[name]` 之后添加：

```typescript
// 从 IndexedDB 删除
try {
  await db.deleteBook(name)
} catch (err) {
  console.error('[App] 删除缓存失败', err)
}
```

**Step 7: 添加加载缓存书籍的函数**

```typescript
// 从缓存加载书籍
async function loadBookFromCache(bookId: string) {
  try {
    const files = await db.getBook(bookId)
    if (files && files.length > 0) {
      const fileMap: Record<string, File> = {}
      files.forEach((file: File) => {
        fileMap[file.name] = file
      })
      folders.value[bookId] = fileMap
      tab.value = bookId

      // 恢复阅读进度
      const pageIndex = await db.getProgress(bookId)
      await nextTick()

      // 滚动到指定页面
      setTimeout(() => {
        const targetImg = document.getElementById(pageIndex.toString())
        if (targetImg) {
          targetImg.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
    }
  } catch (err) {
    console.error('[App] 加载缓存书籍失败', err)
  }
}
```

**Step 8: 添加初始化逻辑**

在 `nextTick` 回调之后添加：

```typescript
// 初始化 IndexedDB 并检查缓存
db.init().then(async () => {
  cacheInitialized.value = true
  const hasCache = await db.hasAnyCache()
  if (hasCache) {
    showCacheDialog.value = true
  }
}).catch(err => {
  console.error('[App] IndexedDB 初始化失败', err)
})
```

**Step 9: 修改滚动事件处理**

找到 `let scroll = (e: MouseEvent) => {` 函数，在 `scrollSync()` 之后添加：

```typescript
updateVisibleIndex()
debouncedSaveProgress()
```

**Step 10: 在 template 中添加 CacheDialog 组件**

在 `</q-layout>` 之前添加：

```vue
<!-- 缓存书架弹窗 -->
<CacheDialog
  v-if="showCacheDialog"
  @select="onCacheSelect"
  @close="showCacheDialog = false"
/>
```

**Step 11: 添加缓存选择处理函数**

```typescript
async function onCacheSelect(bookId: string) {
  showCacheDialog.value = false
  await loadBookFromCache(bookId)
}
```

**Step 12: 验证构建**

```bash
npm run build-only
```

**Step 13: Commit**

```bash
git add src/App.vue
git commit -m "feat: integrate cache storage into App.vue"
```

---

## Task 4: 测试功能

**Step 1: 启动开发服务器**

```bash
npm run dev
```

**Step 2: 手动测试**

1. 打开 http://localhost:5173/
2. 拖拽一个包含图片的文件夹
3. 确认图片正常显示
4. 滚动到中间位置
5. 刷新页面
6. 确认弹窗显示缓存的书籍
7. 点击书籍卡片
8. 确认跳转到之前滚动的大致位置
9. 测试删除单个书籍
10. 测试清空所有缓存

**Step 3: Commit**

```bash
git add -A
git commit -m "test: verify cache functionality works correctly"
```

---

## Task 5: 更新版本号

**Files:**
- Modify: `vite.config.ts`

**Step 1: 更新版本号**

找到 `const version = ...` 行，更新版本号：

```typescript
const version = '1.1.0'
```

**Step 2: Commit**

```bash
git add vite.config.ts
git commit -m "chore: bump version to 1.1.0"
```

---

## 实现清单

| Task | 描述 | 状态 |
|------|------|------|
| 1 | 创建 IndexedDB 封装类 | [ ] |
| 2 | 创建缓存书架弹窗组件 | [ ] |
| 3 | 修改 App.vue 集成缓存功能 | [ ] |
| 4 | 测试功能 | [ ] |
| 5 | 更新版本号 | [ ] |
