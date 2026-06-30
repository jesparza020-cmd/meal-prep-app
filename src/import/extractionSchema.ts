import { SLOTS } from '../types'

export const EXTRACTION_MODEL = 'claude-opus-4-8'

export const DRAFT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    baseServingLabel: { type: 'string' },
    slot: { type: 'string', enum: [...SLOTS] },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          qty: { type: 'number' },
          unit: { type: 'string' },
        },
        required: ['name', 'qty', 'unit'],
      },
    },
    steps: { type: 'array', items: { type: 'string' } },
    nutrition: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            kcal: { type: 'number' },
            protein: { type: 'number' },
            carbs: { type: 'number' },
            fat: { type: 'number' },
          },
          required: ['kcal', 'protein', 'carbs', 'fat'],
        },
        { type: 'null' },
      ],
    },
  },
  required: ['name', 'baseServingLabel', 'slot', 'ingredients', 'steps', 'nutrition'],
} as const

export const EXTRACTION_PROMPT = [
  'Extract this single recipe into the required JSON shape.',
  'Quantify each ingredient with a numeric qty and a unit (use "each" for countable items, "" if unknown).',
  'Pick the most fitting meal slot.',
  'Set "nutrition" ONLY if the source explicitly states calories AND protein AND carbs AND fat per serving.',
  'If any of those four are missing or absent, set "nutrition" to null. Never estimate or invent nutrition numbers.',
].join(' ')
