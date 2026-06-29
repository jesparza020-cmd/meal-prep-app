import { useState } from 'react'
import type { Recipe } from '../types'
import { importRecipe } from '../import/api'
import { draftToRecipe } from '../import/draftToRecipe'

type Mode = 'image' | 'pdf' | 'url'

const MAX_BYTES = 5 * 1024 * 1024

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1)) // strip data: prefix
    }
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

export function ImportModal({
  onCancel,
  onImported,
}: {
  onCancel: () => void
  onImported: (recipe: Recipe, macrosMissing: boolean) => void
}) {
  const [mode, setMode] = useState<Mode>('image')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setError(null)
    setLoading(true)
    try {
      let res
      if (mode === 'url') {
        if (!url.trim()) throw new Error('Enter a recipe URL')
        res = await importRecipe({ type: 'url', url: url.trim() })
      } else {
        if (!file) throw new Error('Choose a file')
        if (file.size > MAX_BYTES) throw new Error('File too large (max 5 MB)')
        const data = await fileToBase64(file)
        res =
          mode === 'image'
            ? await importRecipe({ type: 'image', data, mediaType: file.type || 'image/jpeg' })
            : await importRecipe({ type: 'pdf', data })
      }
      onImported(draftToRecipe(res.draft, res.source), res.draft.nutrition == null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="panel">
      <h2>Import a recipe</h2>

      <div className="field">
        <label>Source</label>
        <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
          <option value="image">Photo / screenshot</option>
          <option value="pdf">PDF</option>
          <option value="url">Web link</option>
        </select>
      </div>

      {mode === 'url' ? (
        <div className="field">
          <label>Recipe URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/best-oatmeal"
            inputMode="url"
          />
        </div>
      ) : (
        <div className="field">
          <label>{mode === 'image' ? 'Image file' : 'PDF file'}</label>
          <input
            type="file"
            accept={mode === 'image' ? 'image/*' : 'application/pdf'}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      )}

      {error && <p className="muted small danger">{error}</p>}

      <div className="grid2">
        <button className="ghost" onClick={onCancel} disabled={loading}>
          Cancel
        </button>
        <button className="primary" onClick={run} disabled={loading}>
          {loading ? 'Importing…' : 'Import'}
        </button>
      </div>
    </section>
  )
}
