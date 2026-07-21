import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createAuthProviderConfigMutation,
  listAuthProviderConfigsQueryKey,
  updateAuthProviderConfigMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import { deriveSlug, isValidSlug } from '@/lib/slug'
import { apiErrorMessage } from '@/lib/api-error'
import {
  deriveAcsUrl,
  deriveRedirectUri,
  deriveSpEntityId,
} from '@/features/settings/redirect-uri'
import { PROVIDER_TYPES } from '@/features/settings/provider-meta'
import { CopyButton } from '@/components/copy-button'
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
import { Textarea } from '@/components/ui/textarea'
import type { AuthProviderConfig, AuthProviderType } from '@/api/generated'

interface FormState {
  type: AuthProviderType
  displayName: string
  slug: string
  clientId: string
  clientSecret: string
  issuer: string
  idpEntityId: string
  idpSsoUrl: string
  idpCertificate: string
}

const EMPTY_FORM: FormState = {
  type: 'google',
  displayName: '',
  slug: '',
  clientId: '',
  clientSecret: '',
  issuer: '',
  idpEntityId: '',
  idpSsoUrl: '',
  idpCertificate: '',
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
    idpEntityId: provider.idpEntityId ?? '',
    idpSsoUrl: provider.idpSsoUrl ?? '',
    // Certificate is never returned; blank means "keep the stored one".
    idpCertificate: '',
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
  const isSaml = form.type === 'saml'
  const origin = window.location.origin
  const slugForUrl = effectiveSlug === '' ? '<slug>' : effectiveSlug
  const redirectUri = editing ? provider.redirectUri : deriveRedirectUri(slugForUrl, origin)
  // SP-side values registered at the IdP. The server returns authoritative
  // values on the saved provider; derive them live in the create dialog.
  const acsUrl = editing ? (provider.acsUrl ?? deriveAcsUrl(slugForUrl, origin)) : deriveAcsUrl(slugForUrl, origin)
  const spEntityId = editing
    ? (provider.spEntityId ?? deriveSpEntityId(slugForUrl, origin))
    : deriveSpEntityId(slugForUrl, origin)

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
    (isOidc && form.issuer.trim() === '') ||
    (isSaml
      ? form.idpEntityId.trim() === '' ||
        form.idpSsoUrl.trim() === '' ||
        (!editing && form.idpCertificate.trim() === '')
      : form.clientId.trim() === '' || (!editing && form.clientSecret === '')) ||
    (!editing && (effectiveSlug === '' || slugInvalid))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (incomplete) return
    if (editing) {
      update.mutate({
        path: { providerId: provider.id },
        body: isSaml
          ? {
              displayName: form.displayName.trim(),
              idpEntityId: form.idpEntityId.trim(),
              idpSsoUrl: form.idpSsoUrl.trim(),
              // Empty certificate means "keep the stored one" — omit the field.
              ...(form.idpCertificate.trim() !== ''
                ? { idpCertificate: form.idpCertificate.trim() }
                : {}),
            }
          : {
              displayName: form.displayName.trim(),
              clientId: form.clientId.trim(),
              ...(isOidc ? { issuer: form.issuer.trim() } : {}),
              // Empty secret means "keep the stored one" — omit the field.
              ...(form.clientSecret !== '' ? { clientSecret: form.clientSecret } : {}),
            },
      })
    } else {
      create.mutate({
        body: isSaml
          ? {
              type: form.type,
              name: effectiveSlug,
              displayName: form.displayName.trim(),
              idpEntityId: form.idpEntityId.trim(),
              idpSsoUrl: form.idpSsoUrl.trim(),
              idpCertificate: form.idpCertificate.trim(),
              enabled: true,
            }
          : {
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
              placeholder={isSaml ? 'Corp SSO' : isOidc ? 'Corp Login' : 'Google'}
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

          {!isSaml && (
            <>
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
            </>
          )}

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

          {isSaml && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="provider-idp-entity-id">IdP entity ID</Label>
                <Input
                  id="provider-idp-entity-id"
                  required
                  className="font-mono"
                  spellCheck={false}
                  placeholder="https://idp.example.com/entity"
                  value={form.idpEntityId}
                  onChange={(e) => set({ idpEntityId: e.target.value })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="provider-idp-sso-url">IdP SSO URL</Label>
                <Input
                  id="provider-idp-sso-url"
                  required
                  type="url"
                  className="font-mono"
                  spellCheck={false}
                  placeholder="https://idp.example.com/sso"
                  value={form.idpSsoUrl}
                  onChange={(e) => set({ idpSsoUrl: e.target.value })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="provider-idp-certificate">IdP signing certificate</Label>
                <Textarea
                  id="provider-idp-certificate"
                  required={!editing}
                  rows={5}
                  className="font-mono text-xs"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={
                    editing
                      ? 'unchanged — paste a new certificate to rotate'
                      : '-----BEGIN CERTIFICATE-----'
                  }
                  value={form.idpCertificate}
                  onChange={(e) => set({ idpCertificate: e.target.value })}
                />
                <p className="text-xs text-ink-3">
                  PEM or base64-encoded DER.
                  {editing ? ' Leave blank to keep the current certificate.' : ''}
                </p>
              </div>
            </>
          )}

          {isSaml ? (
            <div className="flex flex-col gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2.5">
              <p className="text-xs font-medium text-ink">Register these SP details at your IdP</p>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-ink-2">
                  ACS URL (Assertion Consumer Service)
                </span>
                <div className="flex items-center gap-1">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink-2" title={acsUrl}>
                    {acsUrl}
                  </code>
                  <CopyButton value={acsUrl} label="Copy ACS URL" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-ink-2">SP entity ID (audience)</span>
                <div className="flex items-center gap-1">
                  <code
                    className="min-w-0 flex-1 truncate font-mono text-xs text-ink-2"
                    title={spEntityId}
                  >
                    {spEntityId}
                  </code>
                  <CopyButton value={spEntityId} label="Copy SP entity ID" />
                </div>
              </div>
              {!editing && (
                <p className="text-[11px] text-ink-3">
                  Derived from the slug; confirmed once the provider is saved.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2.5">
              <p className="text-xs font-medium text-ink">Register this redirect URI at the IdP</p>
              <code className="mt-1 block font-mono text-xs break-all text-ink-2">
                {redirectUri}
              </code>
            </div>
          )}

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
