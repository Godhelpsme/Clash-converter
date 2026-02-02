import { computed, type Ref } from 'vue'
import { ValidationRules } from '@/utils/validation-rules'
import type { ConfigField } from '@/types/config-metadata'

interface UseFormValidationOptions {
  existingNames?: Ref<string[]>
  excludeName?: Ref<string | null>
}

const uniqueNameRule = ValidationRules.uniqueName as (options?: {
  label?: string
  getExistingNames?: () => string[]
  exclude?: string
}) => unknown

export const useFormValidation = (
  fields: Ref<ConfigField[]>,
  options: UseFormValidationOptions = {}
) => {
  return computed(() => {
    const rules: Record<string, unknown[]> = {}
    const existingNames = options.existingNames?.value || []
    const excludeName = options.excludeName?.value || null

    fields.value.forEach(field => {
      const list: unknown[] = []

      if (field.required) list.push(ValidationRules.required(field.label))
      if (field.key === 'port') list.push(ValidationRules.port(field.label))
      if (field.key === 'server') list.push(ValidationRules.host(field.label))
      if (field.key === 'name') {
        list.push(
          uniqueNameRule({
            label: field.label,
            getExistingNames: () => existingNames,
            exclude: excludeName || undefined
          })
        )
      }

      if (list.length > 0) rules[field.key] = list
    })

    return rules
  })
}
