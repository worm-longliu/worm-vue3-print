// 宿主能力注入键：开源核心不直接发请求、不内置业务字典，相关能力/数据由
// PrintDesigner 经 props 接收后 provide，深层组件通过 inject 获取。
import type { ComputedRef, InjectionKey } from 'vue'
import type { UploadImageFn } from '@worm-vue3-print/core/designer'

/** 图片上传适配器：PrintDesigner provide，ImageContentUpload inject */
export const UPLOAD_IMAGE_KEY: InjectionKey<ComputedRef<UploadImageFn | undefined>> =
  Symbol('print-upload-image')
