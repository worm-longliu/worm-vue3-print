// 宿主能力注入键：开源核心不直接发请求、不内置业务字典，相关能力/数据由
// PrintDesigner 经 props 接收后 provide，深层组件通过 inject 获取。
import type { ComputedRef, InjectionKey } from 'vue'
import type { UploadImageFn, BusinessTypeOption } from '../types'

/** 图片上传适配器：PrintDesigner provide，ImageContentUpload inject */
export const UPLOAD_IMAGE_KEY: InjectionKey<ComputedRef<UploadImageFn | undefined>> =
  Symbol('print-upload-image')

/** 业务类型选项：PrintDesigner provide，PropertyPanel inject */
export const BUSINESS_TYPE_OPTIONS_KEY: InjectionKey<ComputedRef<BusinessTypeOption[]>> =
  Symbol('print-business-type-options')
