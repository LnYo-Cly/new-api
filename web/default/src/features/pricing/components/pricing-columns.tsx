/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { type ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'
import { DataTableColumnHeader } from '@/components/data-table/column-header'
import { GroupBadge } from '@/components/group-badge'
import { DEFAULT_TOKEN_UNIT, QUOTA_TYPE_VALUES } from '../constants'
import {
  getDynamicDisplayGroupRatio,
  getDynamicPricingSummary,
} from '../lib/dynamic-price'
import { parseTags } from '../lib/filters'
import { isTokenBasedModel } from '../lib/model-helpers'
import {
  formatPrice,
  formatRequestPrice,
  stripTrailingZeros,
} from '../lib/price'
import type { PricingModel, TokenUnit } from '../types'

// ----------------------------------------------------------------------------
// Pricing Table Columns
// ----------------------------------------------------------------------------

export interface PricingColumnsOptions {
  tokenUnit?: TokenUnit
  priceRate?: number
  usdExchangeRate?: number
  showRechargePrice?: boolean
}

function renderCompactBadges(
  items: string[],
  variant: 'group' | 'text' = 'text',
  maxDisplay: number = 3
): React.ReactNode {
  if (items.length === 0) {
    return <span className='text-muted-foreground/50 text-xs'>—</span>
  }

  const displayed = items.slice(0, maxDisplay)
  const remaining = items.length - maxDisplay

  return (
    <div className='flex max-w-full flex-wrap items-center gap-1'>
      {displayed.map((item) =>
        variant === 'group' ? (
          <GroupBadge key={item} group={item} size='sm' />
        ) : (
          <span
            key={item}
            className='bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px]'
          >
            {item}
          </span>
        )
      )}
      {remaining > 0 && (
        <span className='text-muted-foreground/50 text-xs'>+{remaining}</span>
      )}
    </div>
  )
}

function renderRatioLines(model: PricingModel, t: (key: string) => string) {
  const isTokenBased = isTokenBasedModel(model)
  const groupRatio = getDynamicDisplayGroupRatio(model)
  const completionRatio =
    isTokenBased && Number(model.completion_ratio || 0) > 0
      ? Number(model.completion_ratio || 0)
      : null

  return [
    {
      label: t('Model Ratio'),
      value:
        isTokenBased && Number(model.model_ratio || 0) > 0
          ? `${Number(model.model_ratio || 0)}`
          : t('None'),
    },
    {
      label: t('Completion Ratio'),
      value: completionRatio !== null ? `${completionRatio}` : t('None'),
    },
    {
      label: t('Group Ratio'),
      value: `${groupRatio}`,
    },
  ]
}

function renderPriceLines(
  model: PricingModel,
  tokenUnit: TokenUnit,
  showRechargePrice: boolean,
  priceRate: number,
  usdExchangeRate: number,
  t: (key: string) => string
) {
  const tokenUnitLabel = tokenUnit === 'K' ? '1K Tokens' : '1M Tokens'
  const dynamicSummary = getDynamicPricingSummary(model, {
    tokenUnit,
    showRechargePrice,
    priceRate,
    usdExchangeRate,
    groupRatioMultiplier: getDynamicDisplayGroupRatio(model),
  })

  if (dynamicSummary) {
    if (dynamicSummary.isSpecialExpression) {
      return [
        {
          label: t('Special billing expression'),
          value: t('Unable to parse structured pricing'),
        },
      ]
    }

    return dynamicSummary.entries.map((entry) => ({
      label: t(entry.label),
      value: `${stripTrailingZeros(entry.formatted)} / ${tokenUnitLabel}`,
    }))
  }

  if (isTokenBasedModel(model)) {
    const priceTypes: Array<{
      type: Parameters<typeof formatPrice>[1]
      label: string
      enabled: boolean
    }> = [
      { type: 'input', label: t('Input Price'), enabled: true },
      { type: 'output', label: t('Completion Price'), enabled: true },
      {
        type: 'cache',
        label: t('Cached Read Price'),
        enabled: model.cache_ratio != null,
      },
      {
        type: 'create_cache',
        label: t('Cache Write Price'),
        enabled: model.create_cache_ratio != null,
      },
      {
        type: 'image',
        label: t('Image Input Price'),
        enabled: model.image_ratio != null,
      },
      {
        type: 'audio_input',
        label: t('Audio Input Price'),
        enabled: model.audio_ratio != null,
      },
      {
        type: 'audio_output',
        label: t('Audio Output Price'),
        enabled:
          model.audio_ratio != null && model.audio_completion_ratio != null,
      },
    ]

    return priceTypes
      .filter((item) => item.enabled)
      .map((item) => ({
        label: item.label,
        value: `${stripTrailingZeros(
          formatPrice(
            model,
            item.type,
            tokenUnit,
            showRechargePrice,
            priceRate,
            usdExchangeRate
          )
        )} / ${tokenUnitLabel}`,
      }))
  }

  return [
    {
      label: t('Model Price'),
      value: `${stripTrailingZeros(
        formatRequestPrice(model, showRechargePrice, priceRate, usdExchangeRate)
      )} / ${t('request')}`,
    },
  ]
}

export function usePricingColumns(
  options: PricingColumnsOptions = {}
): ColumnDef<PricingModel>[] {
  const { t } = useTranslation()
  const {
    tokenUnit = DEFAULT_TOKEN_UNIT,
    priceRate = 1,
    usdExchangeRate = 1,
    showRechargePrice = false,
  } = options

  return [
    // Model column
    {
      accessorKey: 'model_name',
      meta: { label: t('Model') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Model')} />
      ),
      cell: ({ row }) => {
        const model = row.original
        const vendorIcon = model.vendor_icon
          ? getLobeIcon(model.vendor_icon, 14)
          : null

        return (
          <div className='flex min-w-[200px] items-center gap-2'>
            {vendorIcon}
            <span className='truncate font-mono text-sm font-medium'>
              {model.model_name}
            </span>
          </div>
        )
      },
      minSize: 200,
    },

    // Vendor column
    {
      accessorKey: 'vendor_name',
      meta: { label: t('Vendor') },
      header: t('Vendor'),
      cell: ({ row }) => {
        const model = row.original
        if (!model.vendor_name) {
          return <span className='text-muted-foreground/50 text-xs'>—</span>
        }
        const vendorIcon = model.vendor_icon
          ? getLobeIcon(model.vendor_icon, 12)
          : null
        return (
          <span className='text-muted-foreground flex items-center gap-1.5 text-xs'>
            {vendorIcon}
            {model.vendor_name}
          </span>
        )
      },
      size: 120,
      enableSorting: false,
    },

    // Description column
    {
      accessorKey: 'description',
      meta: { label: t('Description') },
      header: t('Description'),
      cell: ({ row }) => (
        <div className='min-w-[200px] max-w-[280px]'>
          <p className='text-foreground line-clamp-2 text-sm leading-5'>
            {row.original.description || ' - '}
          </p>
        </div>
      ),
      size: 260,
      enableSorting: false,
    },

    // Tags column
    {
      accessorKey: 'tags',
      meta: { label: t('Tags') },
      header: t('Tags'),
      cell: ({ row }) => {
        const tags = parseTags(row.original.tags)
        return renderCompactBadges(tags, 'text', 3)
      },
      size: 180,
      enableSorting: false,
    },

    // Billing type column
    {
      accessorKey: 'quota_type',
      meta: { label: t('Billing Type') },
      header: t('Billing Type'),
      cell: ({ row }) => {
        const model = row.original
        const isTokenBased = model.quota_type === QUOTA_TYPE_VALUES.TOKEN
        const isDynamicPricing =
          model.billing_mode === 'tiered_expr' && Boolean(model.billing_expr)

        return (
          <span
            className={cn(
              'inline-flex rounded-full px-2 py-0.5 text-xs',
              isTokenBased
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
                : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300'
            )}
          >
            {isDynamicPricing
              ? t('Token-based')
              : isTokenBased
                ? t('Token-based')
                : t('Per Request')}
          </span>
        )
      },
      size: 110,
      enableSorting: false,
    },

    // Endpoints column
    {
      accessorKey: 'supported_endpoint_types',
      meta: { label: t('Available Endpoint Types') },
      header: t('Available Endpoint Types'),
      cell: ({ row }) => {
        const endpoints = row.original.supported_endpoint_types || []
        return renderCompactBadges(endpoints, 'text', 3)
      },
      size: 160,
      enableSorting: false,
    },

    // Ratio column
    {
      id: 'ratio_info',
      meta: { label: t('Ratio') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Ratio')} />
      ),
      cell: ({ row }) => {
        const ratioLines = renderRatioLines(row.original, t)
        return (
          <div className='min-w-[120px] space-y-1 text-xs'>
            {ratioLines.map((line) => (
              <div key={line.label} className='flex items-center gap-1'>
                <span className='text-foreground'>{line.label}:</span>
                <span className='text-foreground font-medium'>{line.value}</span>
              </div>
            ))}
          </div>
        )
      },
      size: 150,
      enableSorting: false,
    },

    // Model price column
    {
      id: 'model_price_info',
      meta: { label: t('Model Price') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Model Price')} />
      ),
      cell: ({ row }) => {
        const model = row.original
        const priceLines = renderPriceLines(
          model,
          tokenUnit,
          showRechargePrice,
          priceRate,
          usdExchangeRate,
          t
        )

        return (
          <div className='min-w-[230px] space-y-1 text-xs'>
            {priceLines.map((line) => (
              <div key={line.label} className='leading-5'>
                <span className='text-foreground'>{line.label} </span>
                <span className='text-foreground font-medium'>{line.value}</span>
              </div>
            ))}
          </div>
        )
      },
      size: 260,
      enableSorting: false,
    },
  ]
}
