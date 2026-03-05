/**
 * MangaView IndexedDB 封装类
 *
 * 初始化流程:
 *
 * MangaViewDB.getInstance()
 *     |
 *     v
 * init()
 *     |
 *     +-> 打开或创建数据库 (MangaViewCache)
 *     |
 *     +-> 创建 books store (keyPath: id)
 *     |
 *     +-> 创建 progress store (keyPath: bookId)
 *     |
 *     v
 * 数据库就绪
 */

const DB_NAME = 'MangaViewCache'
const DB_VERSION = 1
const BOOKS_STORE = 'books'
const PROGRESS_STORE = 'progress'

/**
 * 书籍记录
 */
export interface BookRecord {
  id: string
  files: File[]
  createdAt: number
  updatedAt: number
}

/**
 * 阅读进度记录
 */
export interface ProgressRecord {
  bookId: string
  pageIndex: number
  lastReadAt: number
}

/**
 * 书籍信息 (用于列表展示)
 */
export interface BookInfo {
  id: string
  fileCount: number
  coverFile: File | null
  updatedAt: number
  lastReadAt: number
  pageIndex: number
}

/**
 * MangaView IndexedDB 操作封装类
 */
class MangaViewDB {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    // 如果已经在初始化中,返回同一个 Promise
    if (this.initPromise) {
      return this.initPromise
    }

    // 如果已经初始化完成
    if (this.db) {
      return
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error('[MangaViewDB] 打开数据库失败:', request.error)
        this.initPromise = null
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        console.log('[MangaViewDB] 数据库连接成功')
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // 创建 books store
        if (!db.objectStoreNames.contains(BOOKS_STORE)) {
          db.createObjectStore(BOOKS_STORE, { keyPath: 'id' })
          console.log('[MangaViewDB] 创建 books store')
        }

        // 创建 progress store
        if (!db.objectStoreNames.contains(PROGRESS_STORE)) {
          db.createObjectStore(PROGRESS_STORE, { keyPath: 'bookId' })
          console.log('[MangaViewDB] 创建 progress store')
        }
      }
    })

    return this.initPromise
  }

  /**
   * 获取数据库实例,确保已初始化
   */
  private async getDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init()
    }
    if (!this.db) {
      throw new Error('[MangaViewDB] 数据库未初始化')
    }
    return this.db
  }

  /**
   * 保存书籍
   * @param name 书籍名称 (作为唯一标识)
   * @param files 书籍包含的文件列表
   */
  async saveBook(name: string, files: File[]): Promise<void> {
    try {
      const db = await this.getDB()
      const now = Date.now()

      // 检查是否已存在
      const existing = await this.getBookRecord(name)
      const record: BookRecord = {
        id: name,
        files: files,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      }

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([BOOKS_STORE], 'readwrite')
        const store = transaction.objectStore(BOOKS_STORE)
        const request = store.put(record)

        request.onerror = () => {
          console.error('[MangaViewDB] 保存书籍失败:', request.error)
          reject(request.error)
        }

        request.onsuccess = () => {
          console.log(`[MangaViewDB] 书籍已保存: ${name}, 文件数: ${files.length}`)
          resolve()
        }
      })
    } catch (error) {
      console.error('[MangaViewDB] saveBook 异常:', error)
      throw error
    }
  }

  /**
   * 获取书籍记录
   * @param name 书籍名称
   * @returns 书籍记录或 null
   */
  private async getBookRecord(name: string): Promise<BookRecord | null> {
    const db = await this.getDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([BOOKS_STORE], 'readonly')
      const store = transaction.objectStore(BOOKS_STORE)
      const request = store.get(name)

      request.onerror = () => {
        console.error('[MangaViewDB] 获取书籍记录失败:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        resolve(request.result || null)
      }
    })
  }

  /**
   * 获取书籍文件列表
   * @param name 书籍名称
   * @returns 文件列表或 null
   */
  async getBook(name: string): Promise<File[] | null> {
    try {
      const record = await this.getBookRecord(name)
      return record?.files || null
    } catch (error) {
      console.error('[MangaViewDB] getBook 异常:', error)
      return null
    }
  }

  /**
   * 获取所有书籍信息列表
   * @returns 按 lastReadAt 倒序排列的书籍信息列表
   */
  async getAllBooks(): Promise<BookInfo[]> {
    try {
      const db = await this.getDB()

      const books = await new Promise<BookRecord[]>((resolve, reject) => {
        const transaction = db.transaction([BOOKS_STORE], 'readonly')
        const store = transaction.objectStore(BOOKS_STORE)
        const request = store.getAll()

        request.onerror = () => {
          console.error('[MangaViewDB] 获取所有书籍失败:', request.error)
          reject(request.error)
        }

        request.onsuccess = () => {
          resolve(request.result || [])
        }
      })

      // 获取所有进度记录
      const progressMap = await this.getAllProgress()

      // 组装 BookInfo 列表
      const bookInfos: BookInfo[] = books.map((book) => {
        const progress = progressMap.get(book.id)
        return {
          id: book.id,
          fileCount: book.files.length,
          coverFile: book.files.length > 0 ? book.files[0] : null,
          updatedAt: book.updatedAt,
          lastReadAt: progress?.lastReadAt || 0,
          pageIndex: progress?.pageIndex || 0
        }
      })

      // 按 lastReadAt 倒序排列
      bookInfos.sort((a, b) => b.lastReadAt - a.lastReadAt)

      return bookInfos
    } catch (error) {
      console.error('[MangaViewDB] getAllBooks 异常:', error)
      return []
    }
  }

  /**
   * 获取所有进度记录
   * @returns 以 bookId 为 key 的进度 Map
   */
  private async getAllProgress(): Promise<Map<string, ProgressRecord>> {
    const db = await this.getDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([PROGRESS_STORE], 'readonly')
      const store = transaction.objectStore(PROGRESS_STORE)
      const request = store.getAll()

      request.onerror = () => {
        console.error('[MangaViewDB] 获取所有进度失败:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        const map = new Map<string, ProgressRecord>()
        const records = request.result || []
        records.forEach((record) => {
          map.set(record.bookId, record)
        })
        resolve(map)
      }
    })
  }

  /**
   * 删除书籍
   * @param name 书籍名称
   */
  async deleteBook(name: string): Promise<void> {
    try {
      const db = await this.getDB()

      // 删除书籍记录
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([BOOKS_STORE], 'readwrite')
        const store = transaction.objectStore(BOOKS_STORE)
        const request = store.delete(name)

        request.onerror = () => {
          console.error('[MangaViewDB] 删除书籍失败:', request.error)
          reject(request.error)
        }

        request.onsuccess = () => {
          console.log(`[MangaViewDB] 书籍已删除: ${name}`)
          resolve()
        }
      })

      // 同时删除对应的进度记录
      await this.deleteProgress(name)
    } catch (error) {
      console.error('[MangaViewDB] deleteBook 异常:', error)
      throw error
    }
  }

  /**
   * 删除进度记录
   * @param bookId 书籍 ID
   */
  private async deleteProgress(bookId: string): Promise<void> {
    const db = await this.getDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([PROGRESS_STORE], 'readwrite')
      const store = transaction.objectStore(PROGRESS_STORE)
      const request = store.delete(bookId)

      request.onerror = () => {
        console.error('[MangaViewDB] 删除进度失败:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        resolve()
      }
    })
  }

  /**
   * 清空所有数据
   */
  async clearAll(): Promise<void> {
    try {
      const db = await this.getDB()

      // 清空 books store
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([BOOKS_STORE], 'readwrite')
        const store = transaction.objectStore(BOOKS_STORE)
        const request = store.clear()

        request.onerror = () => {
          console.error('[MangaViewDB] 清空书籍失败:', request.error)
          reject(request.error)
        }

        request.onsuccess = () => {
          console.log('[MangaViewDB] 书籍已清空')
          resolve()
        }
      })

      // 清空 progress store
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([PROGRESS_STORE], 'readwrite')
        const store = transaction.objectStore(PROGRESS_STORE)
        const request = store.clear()

        request.onerror = () => {
          console.error('[MangaViewDB] 清空进度失败:', request.error)
          reject(request.error)
        }

        request.onsuccess = () => {
          console.log('[MangaViewDB] 进度已清空')
          resolve()
        }
      })

      console.log('[MangaViewDB] 所有缓存已清空')
    } catch (error) {
      console.error('[MangaViewDB] clearAll 异常:', error)
      throw error
    }
  }

  /**
   * 保存阅读进度
   * @param bookId 书籍 ID
   * @param pageIndex 当前页码
   */
  async saveProgress(bookId: string, pageIndex: number): Promise<void> {
    try {
      const db = await this.getDB()
      const now = Date.now()

      const record: ProgressRecord = {
        bookId: bookId,
        pageIndex: pageIndex,
        lastReadAt: now
      }

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([PROGRESS_STORE], 'readwrite')
        const store = transaction.objectStore(PROGRESS_STORE)
        const request = store.put(record)

        request.onerror = () => {
          console.error('[MangaViewDB] 保存进度失败:', request.error)
          reject(request.error)
        }

        request.onsuccess = () => {
          console.log(`[MangaViewDB] 进度已保存: ${bookId}, 页码: ${pageIndex}`)
          resolve()
        }
      })
    } catch (error) {
      console.error('[MangaViewDB] saveProgress 异常:', error)
      throw error
    }
  }

  /**
   * 获取阅读进度
   * @param bookId 书籍 ID
   * @returns 当前页码,如果没有记录则返回 0
   */
  async getProgress(bookId: string): Promise<number> {
    try {
      const db = await this.getDB()

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([PROGRESS_STORE], 'readonly')
        const store = transaction.objectStore(PROGRESS_STORE)
        const request = store.get(bookId)

        request.onerror = () => {
          console.error('[MangaViewDB] 获取进度失败:', request.error)
          reject(request.error)
        }

        request.onsuccess = () => {
          const record = request.result as ProgressRecord | undefined
          resolve(record?.pageIndex || 0)
        }
      })
    } catch (error) {
      console.error('[MangaViewDB] getProgress 异常:', error)
      return 0
    }
  }

  /**
   * 检查是否有任何缓存数据
   * @returns 如果有缓存返回 true
   */
  async hasAnyCache(): Promise<boolean> {
    try {
      const db = await this.getDB()

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([BOOKS_STORE], 'readonly')
        const store = transaction.objectStore(BOOKS_STORE)
        const request = store.count()

        request.onerror = () => {
          console.error('[MangaViewDB] 检查缓存失败:', request.error)
          reject(request.error)
        }

        request.onsuccess = () => {
          resolve(request.result > 0)
        }
      })
    } catch (error) {
      console.error('[MangaViewDB] hasAnyCache 异常:', error)
      return false
    }
  }
}

// 单例导出
export const db = new MangaViewDB()
