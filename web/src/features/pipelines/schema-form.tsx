import { useState } from 'react'
import { ChevronRight, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { REDACTED_SENTINEL } from '@/lib/secrets'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

/**
 * Small, recursive JSON-Schema-driven form for collector component configs.
 * Supports the subset the curated catalog uses — strings (incl. password),
 * numbers, booleans, enums, nested objects, and additionalProperties maps.
 * Anything else falls back to a raw JSON textarea for that subtree.
 */
export interface JsonSchema {
  type?: string | string[]
  title?: string
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  enum?: Array<string | number>
  format?: string
  default?: unknown
  additionalProperties?: boolean | JsonSchema
  [key: string]: unknown
}

export type FieldKind =
  | 'enum'
  | 'string'
  | 'password'
  | 'number'
  | 'boolean'
  | 'object'
  | 'map'
  | 'json'

function schemaType(schema: JsonSchema): string | undefined {
  if (Array.isArray(schema.type)) return schema.type.find((t) => t !== 'null')
  return schema.type
}

/** Classify a subschema into the widget that renders it. Exported for tests. */
export function fieldKind(schema: JsonSchema): FieldKind {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return 'enum'
  switch (schemaType(schema)) {
    case 'string':
      return schema.format === 'password' ? 'password' : 'string'
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'object':
      if (schema.properties) return 'object'
      if (schema.additionalProperties) return 'map'
      return 'json'
    default:
      return 'json'
  }
}

export function SchemaForm({
  schema,
  value,
  onChange,
  readOnly = false,
  idPrefix,
}: {
  schema: JsonSchema
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  readOnly?: boolean
  idPrefix: string
}) {
  if (fieldKind(schema) !== 'object') {
    // Root schema we cannot decompose — edit the whole config as JSON.
    return (
      <JsonField
        id={`${idPrefix}-json`}
        label="config"
        value={value}
        onChange={(next) => onChange((next ?? {}) as Record<string, unknown>)}
        readOnly={readOnly}
      />
    )
  }
  return (
    <ObjectFields
      schema={schema}
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      idPrefix={idPrefix}
    />
  )
}

function ObjectFields({
  schema,
  value,
  onChange,
  readOnly,
  idPrefix,
}: {
  schema: JsonSchema
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  readOnly: boolean
  idPrefix: string
}) {
  const properties = schema.properties ?? {}
  const required = new Set(schema.required ?? [])

  const setField = (key: string, next: unknown) => {
    const updated = { ...value }
    if (next === undefined) {
      delete updated[key]
    } else {
      updated[key] = next
    }
    onChange(updated)
  }

  return (
    <div className="flex flex-col gap-3">
      {Object.entries(properties).map(([key, propSchema]) => (
        <SchemaField
          key={key}
          name={key}
          schema={propSchema}
          required={required.has(key)}
          value={value[key]}
          onChange={(next) => setField(key, next)}
          readOnly={readOnly}
          id={`${idPrefix}-${key}`}
        />
      ))}
    </div>
  )
}

function SchemaField({
  name,
  schema,
  required,
  value,
  onChange,
  readOnly,
  id,
}: {
  name: string
  schema: JsonSchema
  required: boolean
  value: unknown
  onChange: (next: unknown) => void
  readOnly: boolean
  id: string
}) {
  const kind = fieldKind(schema)

  if (kind === 'object') {
    return (
      <NestedObject
        name={name}
        schema={schema}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        id={id}
      />
    )
  }
  if (kind === 'json') {
    return (
      <JsonField
        id={id}
        label={name}
        description={schema.description}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
      />
    )
  }
  if (kind === 'map') {
    return (
      <FieldShell name={name} required={required} description={schema.description} htmlFor={id}>
        <MapField
          id={id}
          valueSchema={
            typeof schema.additionalProperties === 'object' ? schema.additionalProperties : {}
          }
          value={(value ?? {}) as Record<string, unknown>}
          onChange={(next) => onChange(Object.keys(next).length === 0 ? undefined : next)}
          readOnly={readOnly}
        />
      </FieldShell>
    )
  }

  return (
    <FieldShell
      name={name}
      required={required}
      description={schema.description}
      htmlFor={id}
      inline={kind === 'boolean'}
    >
      <PrimitiveField
        kind={kind}
        id={id}
        label={name}
        schema={schema}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
      />
    </FieldShell>
  )
}

function FieldShell({
  name,
  required,
  description,
  htmlFor,
  inline = false,
  children,
}: {
  name: string
  required: boolean
  description?: string
  htmlFor: string
  inline?: boolean
  children: React.ReactNode
}) {
  const label = (
    <label htmlFor={htmlFor} className="font-mono text-[11px] font-medium text-ink-2 select-none">
      {name}
      {required && (
        <span aria-hidden className="text-danger">
          {' '}
          *
        </span>
      )}
    </label>
  )
  return (
    <div className="flex flex-col gap-1">
      {inline ? (
        <div className="flex items-center justify-between gap-3">
          {label}
          {children}
        </div>
      ) : (
        <>
          {label}
          {children}
        </>
      )}
      {description && <p className="text-[11px] leading-4 text-ink-3">{description}</p>}
    </div>
  )
}

function PrimitiveField({
  kind,
  id,
  label,
  schema,
  value,
  onChange,
  readOnly,
}: {
  kind: Exclude<FieldKind, 'object' | 'map' | 'json'>
  id: string
  label: string
  schema: JsonSchema
  value: unknown
  onChange: (next: unknown) => void
  readOnly: boolean
}) {
  switch (kind) {
    case 'enum':
      return (
        <Select
          id={id}
          value={value === undefined || value === null ? '' : String(value)}
          disabled={readOnly}
          onChange={(e) => {
            if (e.target.value === '') {
              onChange(undefined)
              return
            }
            const option = (schema.enum ?? []).find((o) => String(o) === e.target.value)
            onChange(option ?? e.target.value)
          }}
        >
          <option value="">(not set)</option>
          {(schema.enum ?? []).map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option)}
            </option>
          ))}
        </Select>
      )
    case 'boolean':
      return (
        <Switch
          id={id}
          aria-label={label}
          checked={Boolean(value)}
          disabled={readOnly}
          onCheckedChange={(checked) => onChange(checked)}
        />
      )
    case 'number':
      return (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          className="font-mono"
          value={value === undefined || value === null ? '' : String(value)}
          disabled={readOnly}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') {
              onChange(undefined)
              return
            }
            const parsed = Number(raw)
            if (!Number.isNaN(parsed)) {
              onChange(schemaType(schema) === 'integer' ? Math.trunc(parsed) : parsed)
            }
          }}
        />
      )
    case 'password':
      return (
        <PasswordField
          id={id}
          label={label}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
        />
      )
    case 'string':
      return (
        <Input
          id={id}
          type="text"
          spellCheck={false}
          className="font-mono"
          placeholder={schema.default !== undefined ? String(schema.default) : undefined}
          value={value === undefined || value === null ? '' : String(value)}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        />
      )
  }
}

/**
 * Password input with stored-secret handling. The API redacts secrets to
 * REDACTED_SENTINEL on read; sending the sentinel back keeps the stored
 * value, any other string rotates it. While the value is the sentinel we
 * show a "stored" placeholder with a replace affordance; once replaced, a
 * reset icon restores the sentinel (i.e. keeps the stored secret).
 */
function PasswordField({
  id,
  label,
  value,
  onChange,
  readOnly,
}: {
  id: string
  label: string
  value: unknown
  onChange: (next: unknown) => void
  readOnly: boolean
}) {
  // Whether this field held a stored secret when it mounted — controls the
  // reset affordance after the user opts to replace it.
  const [hadStoredSecret, setHadStoredSecret] = useState(() => value === REDACTED_SENTINEL)
  if (value === REDACTED_SENTINEL && !hadStoredSecret) setHadStoredSecret(true)

  if (value === REDACTED_SENTINEL) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          type="text"
          readOnly
          className="font-mono text-ink-3"
          value=""
          placeholder="•••••• (stored)"
          aria-label={`${label} (stored secret)`}
        />
        {!readOnly && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => onChange(undefined)}
            aria-label={`Replace ${label}`}
          >
            Replace
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        id={id}
        type="password"
        autoComplete="off"
        spellCheck={false}
        className="font-mono"
        value={value === undefined || value === null ? '' : String(value)}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      />
      {!readOnly && hadStoredSecret && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => onChange(REDACTED_SENTINEL)}
          aria-label={`Keep stored ${label}`}
          title="Keep the stored secret"
        >
          <RotateCcw />
        </Button>
      )}
    </div>
  )
}

function NestedObject({
  name,
  schema,
  value,
  onChange,
  readOnly,
  id,
}: {
  name: string
  schema: JsonSchema
  value: unknown
  onChange: (next: unknown) => void
  readOnly: boolean
  id: string
}) {
  const current = (value ?? {}) as Record<string, unknown>
  const [open, setOpen] = useState(() => Object.keys(current).length > 0)

  return (
    <div className="rounded-md border border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent/70"
      >
        <ChevronRight
          aria-hidden
          className={cn('size-3.5 text-ink-3 transition-transform', open && 'rotate-90')}
        />
        <span className="font-mono text-[11px] font-medium text-ink-2">{name}</span>
        {schema.description && !open && (
          <span className="min-w-0 truncate text-[11px] text-ink-3">{schema.description}</span>
        )}
      </button>
      {open && (
        <div className="border-t border-line p-2.5">
          <ObjectFields
            schema={schema}
            value={current}
            onChange={(next) => onChange(Object.keys(next).length === 0 ? undefined : next)}
            readOnly={readOnly}
            idPrefix={id}
          />
        </div>
      )}
    </div>
  )
}

/**
 * additionalProperties map (e.g. headers): key/value row editor. Rows are
 * keyed by index so renaming a key keeps focus in the input.
 */
function MapField({
  id,
  valueSchema,
  value,
  onChange,
  readOnly,
}: {
  id: string
  valueSchema: JsonSchema
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  readOnly: boolean
}) {
  const entries = Object.entries(value)
  const password = valueSchema.format === 'password'

  const commit = (next: Array<[string, unknown]>) => {
    onChange(Object.fromEntries(next))
  }

  return (
    <div className="flex flex-col gap-1.5">
      {entries.map(([key, entryValue], index) => (
        <div key={index} className="flex items-center gap-1.5">
          <Input
            aria-label="Key"
            className="font-mono"
            spellCheck={false}
            value={key}
            disabled={readOnly}
            id={index === 0 ? id : undefined}
            onChange={(e) => {
              const next = [...entries] as Array<[string, unknown]>
              next[index] = [e.target.value, entryValue]
              commit(next)
            }}
          />
          <Input
            aria-label="Value"
            className="font-mono"
            type={password ? 'password' : 'text'}
            autoComplete={password ? 'off' : undefined}
            spellCheck={false}
            value={entryValue === undefined || entryValue === null ? '' : String(entryValue)}
            disabled={readOnly}
            onChange={(e) => {
              const next = [...entries] as Array<[string, unknown]>
              next[index] = [key, e.target.value]
              commit(next)
            }}
          />
          {!readOnly && (
            <button
              type="button"
              aria-label={`Remove ${key === '' ? 'entry' : key}`}
              onClick={() => commit(entries.filter((_, i) => i !== index))}
              className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-ink-3 outline-none hover:bg-surface-2 hover:text-danger focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => commit([...entries, ['', '']])}
        >
          Add entry
        </Button>
      )}
      {entries.length === 0 && readOnly && <p className="text-[11px] text-ink-3">No entries.</p>}
    </div>
  )
}

/** Fallback for schema constructs the generator does not model. */
function JsonField({
  id,
  label,
  description,
  value,
  onChange,
  readOnly,
}: {
  id: string
  label: string
  description?: string
  value: unknown
  onChange: (next: unknown) => void
  readOnly: boolean
}) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2))
  const [invalid, setInvalid] = useState(false)

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-mono text-[11px] font-medium text-ink-2 select-none">
        {label} <span className="font-normal text-ink-3">(JSON)</span>
      </label>
      <Textarea
        id={id}
        rows={4}
        spellCheck={false}
        className={cn('font-mono text-xs', invalid && 'border-danger/60')}
        value={text}
        disabled={readOnly}
        aria-invalid={invalid}
        onChange={(e) => {
          setText(e.target.value)
          if (e.target.value.trim() === '') {
            setInvalid(false)
            onChange(undefined)
            return
          }
          try {
            const parsed: unknown = JSON.parse(e.target.value)
            setInvalid(false)
            onChange(parsed === null ? undefined : parsed)
          } catch {
            setInvalid(true)
          }
        }}
      />
      {invalid && (
        <p role="alert" className="text-[11px] text-danger">
          Not valid JSON — the last valid value is kept until this parses.
        </p>
      )}
      {description && <p className="text-[11px] leading-4 text-ink-3">{description}</p>}
    </div>
  )
}
