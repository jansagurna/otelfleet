import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createAuthProviderConfigMutation,
  listAuthProviderConfigsQueryKey,
  updateAuthProviderConfigMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import { deriveSlug, isValidSlug } from '@/lib/slug'
import { apiErrorMessage } from '@/lib/api-error'
import { deriveRedirectUri } from '@/features/settings/redirect-uri'
import { PROVIDER_TYPES } from '@/features/settings/provider-meta'
import { toast } from '@/components/toaster'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { AuthProviderConfig, AuthProviderType } from '@/api/generated'

interface FormState {
  type: AuthProviderType
  displayName: string
  slug: string
  clientId: string
  clientSecret: string
  issuer: string
}

const EMPTY_FORM: FormState = {
  type: 'google',
  displayName: '',
  slug: '',
  clientId: '',
  clientSecret: '',
  issuer: '',
}

function formFor(provider: AuthProviderConfig | null): FormState {
  if (provider === null) return EMPTY_FORM
  return {
    type: provider.type,
    displayName: provider.displayName,
    slug: provider.name,
    clientId: provider.clientId,
    clientSecret: '',
    issuer: provider.issuer ?? '',
  }
}

/**
 * Add/edit dialog for SSO providers. `provider === null` creates; otherwise
 * edits (type and slug are immutable after creation — the slug is baked
 * into the redirect URI registered at the IdP).
 */
export function ProviderDialog({
  open,
  onOpenChange,
  provider,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider: AuthProviderConfig | null
}) {
  const editing = provider !== null
  const [form, setForm] = useState<FormState>(() => formFor(provider))
  const queryClient = useQueryClient()

  // Re-seed the form whenever the dialog opens for a different target.
  useEffect(() => {
    if (open) setForm(formFor(provider))
  }, [open, provider])

  const set = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }))

  const derivedSlug = deriveSlug(form.displayName)
  const effectiveSlug = editing ? form.slug : form.slug.trim() === '' ? derivedSlug : form.slug.trim()
  const slugInvalid = !editing && effectiveSlug !== '' && !isValidSlug(effectiveSlug)
  const isOidc = form.type === 'oidc'
  const redirectUri = editing
    ? provider.redirectUri
    : deriveRedirectUri(effectiveSlug === '' ? '<slug>' : effectiveSlug, window.location.origin)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: listAuthProviderConfigsQueryKey() })

  const create = useMutation({
    ...createAuthProviderConfigMutation(),
    onSuccess: (created) => {
      void invalidate()
      onOpenChange(false)
      toast(`Provider "${created.displayName}" added`)
    },
  })

  const update = useMutation({
    ...updateAuthProviderConfigMutation(),
    onSuccess: (updated) => {
      void invalidate()
      onOpenChange(false)
      toast(`Provider "${updated.displayName}" saved`)
    },
  })

  const pending = create.isPending || update.isPending
  const error = create.error ?? update.error

  const incomplete =
    form.displayName.trim() === '' ||
    form.clientId.trim() === '' ||
    (isOidc && form.issuer.trim() === '') ||
    (!editing && (form.clientSecret === '' || effectiveSlug === '' || slugInvalid))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (incomplete) return
    if (editing) {
      update.mutate({
        path: { providerId: provider.id },
        body: {
          displayName: form.displayName.trim(),
          clientId: form.clientId.trim(),
          ...(isOidc ? { issuer: form.issuer.trim() } : {}),
          // Empty secret means "keep the stored one" — omit the field.
          ...(form.clientSecret !== '' ? { clientSecret: form.clientSecret } : {}),
        },
      })
    } else {
      create.mutate({
        body: {
          type: form.type,
          name: effectiveSlug,
          displayName: form.displayName.trim(),
          clientId: form.clientId.trim(),
          clientSecret: form.clientSecret,
          ...(isOidc ? { issuer: form.issuer.trim() } : {}),
          enabled: true,
        },
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${provider.displayName}` : 'Add SSO provider'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Type and slug are fixed — they are part of the redirect URI registered at the IdP.'
              : 'Users sign in through this provider; new sign-ins require an invite first.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {!editing && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="provider-type">Type</Label>
              <Select
                id="provider-type"
                value={form.type}
                onChange={(e) => set({ type: e.target.value as AuthProviderType })}
              >
                {PROVIDER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="provider-display-name">Display name</Label>
            <Input
              id="provider-display-name"
              required
              maxLength={100}
              placeholder={isOidc ? 'Corp Login' : 'Google'}
              value={form.displayName}
              onChange={(e) => set({ displayName: e.target.value })}
            />
          </div>

          {!editing && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="provider-slug">
                Slug <span className="font-normal text-ink-3">(login URL path)</span>
              </Label>
              <Input
                id="provider-slug"
                className="font-mono"
                spellCheck={false}
                placeholder={derivedSlug === '' ? 'google' : derivedSlug}
                value={form.slug}
                onChange={(e) => set({ slug: e.target.value })}
                aria-invalid={slugInvalid}
              />
              {slugInvalid && (
                <p role="alert" className="text-xs text-danger">
                  Slugs are 3–64 lowercase letters, digits, and hyphens, starting and ending with a
                  letter or digit.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="provider-client-id">Client ID</Label>
            <Input
              id="provider-client-id"
              required
              className="font-mono"
              spellCheck={false}
              autoComplete="off"
              value={form.clientId}
              onChange={(e) => set({ clientId: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="provider-client-secret">Client secret</Label>
            <Input
              id="provider-client-secret"
              type="password"
              className="font-mono"
              autoComplete="off"
              required={!editing}
              placeholder={editing ? 'unchanged — enter to rotate' : undefined}
              value={form.clientSecret}
              onChange={(e) => set({ clientSecret: e.target.value })}
            />
          </div>

          {isOidc && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="provider-issuer">Issuer URL</Label>
              <Input
                id="provider-issuer"
                required
                type="url"
                className="font-mono"
                spellCheck={false}
                placeholder="https://login.example.com"
                value={form.issuer}
                onChange={(e) => set({ issuer: e.target.value })}
              />
              <p className="text-xs text-ink-3">
                Discovery via {'{issuer}'}/.well-known/openid-configuration.
              </p>
            </div>
          )}

          <div className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2.5">
            <p className="text-xs font-medium text-ink">Register this redirect URI at the IdP</p>
            <code className="mt-1 block font-mono text-xs break-all text-ink-2">{redirectUri}</code>
          </div>

          {error !== null && (
            <p role="alert" className="text-xs text-danger">
              {apiErrorMessage(
                error,
                editing ? 'Could not save the provider.' : 'Could not add the provider.',
              )}
            </p>
          )}

          <DialogFooter className="mt-1">
            <DialogClose asChild>
              <Button variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" disabled={pending || incomplete}>
              {pending ? 'Saving…' : editing ? 'Save changes' : 'Add provider'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
