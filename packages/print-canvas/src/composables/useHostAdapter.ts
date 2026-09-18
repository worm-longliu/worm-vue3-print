// 宿主能力注入键：开源核心不直接发请求、不内置业务字典，相关能力/数据由
// PrintDesigner 经 props 接收后 provide，深层组件通过 inject 获取。
import type { ComputedRef, InjectionKey } from 'vue'
import type { UploadDesignBackgroundFn, UploadImageFn } from '@worm-vue3-print/core/designer'
import type { FontCatalog } from '@worm-vue3-print/core'
import type { FontQueryHandle } from './useFontQuery'

/** 图片上传适配器：PrintDesigner provide，ImageContentUpload inject */
export const UPLOAD_IMAGE_KEY: InjectionKey<ComputedRef<UploadImageFn | undefined>> =
  Symbol('print-upload-image')

/** 设计背景上传适配器：PrintDesigner provide，DesignBackgroundConfig inject */
export const UPLOAD_DESIGN_BACKGROUND_KEY: InjectionKey<ComputedRef<UploadDesignBackgroundFn | undefined>> =
  Symbol('print-upload-design-background')

/** 字体目录：PrintDesigner provide，属性面板与状态栏 inject */
export const FONT_CATALOG_KEY: InjectionKey<ComputedRef<FontCatalog>> =
  Symbol('print-font-catalog')

/** 手动字体查询句柄：PrintDesigner provide，FontSelect inject */
export const FONT_QUERY_KEY: InjectionKey<ComputedRef<FontQueryHandle>> =
  Symbol('print-font-query')
