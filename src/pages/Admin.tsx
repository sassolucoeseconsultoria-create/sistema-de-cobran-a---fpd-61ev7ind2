import React, { useState, useEffect, useMemo } from 'react'
import {
  Users,
  Shield,
  UserCheck,
  UserCog,
  Store,
  Plus,
  Search,
  Trash2,
  Pencil,
  AlertCircle,
  Phone,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User as UserIcon,
  CheckCircle2,
  RefreshCw,
  Check,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth, type UserRole, type User } from '@/contexts/AuthContext'
import { FIXED_STORE_NAMES, fixedStoresAsRecords } from '@/services/fixedStores'
import {
  fetchStores,
  normalizeStoreString,
  fetchDistinctReferenceDates,
} from '@/services/fpdService'
import {
  fetchReferenceDatePermissions,
  saveReferenceDatePermission,
} from '@/services/referenceDatePermissionService'
import type { StoreRecord, ReferenceDatePermissionRecord } from '@/types/fpd'
import { Switch } from '@/components/ui/switch'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import useRealtime from '@/hooks/use-realtime'
import { cn } from '@/lib/utils'

// Helper to format Brazilian phone numbers: (99) 9999-9999 or (99) 99999-9999
export const formatPhoneNumber = (value: string): string => {
  if (!value) return ''
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length === 0) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
}

export const Admin: React.FC = () => {
  const { user: currentUser } = useAuth()
  const { toast } = useToast()

  const [users, setUsers] = useState<User[]>([])
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL')

  // Reference Date Permissions state
  const [refDates, setRefDates] = useState<string[]>([])
  const [refPermissions, setRefPermissions] = useState<ReferenceDatePermissionRecord[]>([])
  const [loadingRefDates, setLoadingRefDates] = useState(true)
  const [savingRefDate, setSavingRefDate] = useState<string | null>(null)

  // Modal State for Create / Edit
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [storeSearchQuery, setStoreSearchQuery] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    fone: '',
    password: '',
    passwordConfirm: '',
    role: 'Supervisor' as UserRole,
    lojas: [] as string[],
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Delete modal state
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Carrega as lojas REAIS do backend na ordem da lista fixa. Os vínculos de
  // usuários (users.lojas) são relations por ID do PocketBase — usar os IDs
  // falsos (id = nome) da lista fixa quebra o salvamento. Se a busca falhar,
  // cai no fallback local (somente leitura/visual).
  const loadStores = async () => {
    try {
      const records = await fetchStores()
      const byName = new Map<string, StoreRecord>()
      records.forEach((s) => {
        if (!byName.has(s.name)) byName.set(s.name, s)
      })
      const ordered: StoreRecord[] = []
      FIXED_STORE_NAMES.forEach((name) => {
        const match = byName.get(name)
        if (match && !ordered.some((s) => s.id === match.id)) {
          ordered.push(match)
        }
      })
      setStores(ordered.length > 0 ? ordered : fixedStoresAsRecords())
    } catch (err) {
      console.error('Falha ao carregar lojas do backend, usando lista fixa local:', err)
      setStores(fixedStoresAsRecords())
    }
  }

  // Fetch Users and Stores
  const loadData = async () => {
    try {
      setLoading(true)
      const userList = await pb.collection('users').getFullList<User>({
        sort: '-created',
      })
      setUsers(userList)
    } catch (err: unknown) {
      console.error(err)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível buscar os usuários cadastrados.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
    await loadStores()
    await loadReferenceDatesData()
  }

  const loadReferenceDatesData = async () => {
    try {
      setLoadingRefDates(true)
      const [dates, perms] = await Promise.all([
        fetchDistinctReferenceDates(),
        fetchReferenceDatePermissions(),
      ])
      setRefDates(dates)
      setRefPermissions(perms)
    } catch (err) {
      console.error('Falha ao carregar datas de referência ou permissões:', err)
      toast({
        title: 'Erro ao carregar datas de referência',
        description: 'Não foi possível carregar as permissões por perfil.',
        variant: 'destructive',
      })
    } finally {
      setLoadingRefDates(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Realtime updates for reference_date_permissions
  useRealtime<ReferenceDatePermissionRecord>('reference_date_permissions', (e) => {
    if (e.action === 'create') {
      setRefPermissions((prev) => {
        if (prev.some((p) => p.id === e.record.id)) return prev
        return [...prev, e.record]
      })
    } else if (e.action === 'update') {
      setRefPermissions((prev) =>
        prev.map((p) => (p.id === e.record.id ? { ...p, ...e.record } : p)),
      )
    } else if (e.action === 'delete') {
      setRefPermissions((prev) => prev.filter((p) => p.id !== e.record.id))
    }
  })

  // Realtime updates for users collection
  useRealtime<User>('users', (e) => {
    if (e.action === 'create') {
      setUsers((prev) => {
        const existing = prev.find((u) => u.id === e.record.id)
        if (existing) {
          // Se já existe localmente, faz merge preservando campos locais caso o evento venha sem email
          return prev.map((u) =>
            u.id === e.record.id ? { ...u, ...e.record, email: e.record.email || u.email } : u,
          )
        }
        return [e.record, ...prev]
      })
    } else if (e.action === 'update') {
      setUsers((prev) => {
        const current = prev.find((u) => u.id === e.record.id)
        if (!current) return prev
        // Preserva e-mail/campos existentes se o evento de realtime vier com campo vazio por visibilidade
        const merged: User = {
          ...current,
          ...e.record,
          email: e.record.email || current.email,
          name: e.record.name || current.name,
          fone: e.record.fone !== undefined ? e.record.fone : current.fone,
          role: e.record.role || current.role,
          lojas: e.record.lojas !== undefined ? e.record.lojas : current.lojas,
        }
        // Ignora eventos que não alteram nada (ex.: eco do próprio save),
        // evitando que um payload defasado sobrescreva o estado recém-salvo
        if (JSON.stringify(merged) === JSON.stringify(current)) return prev
        return prev.map((u) => (u.id === merged.id ? merged : u))
      })
    } else if (e.action === 'delete') {
      setUsers((prev) => prev.filter((u) => u.id !== e.record.id))
    }
  })

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingUser(null)
    setStoreSearchQuery('')
    setFormData({
      name: '',
      email: '',
      fone: '',
      password: '',
      passwordConfirm: '',
      role: 'Supervisor',
      lojas: [],
    })
    setShowPassword(false)
    setShowPasswordConfirm(false)
    setFormErrors({})
    setGeneralError(null)
    setModalOpen(true)
  }

  // Normalize legacy roles if any record comes with old string
  const normalizeRole = (role?: string): UserRole => {
    if (role === 'GESTOR') return 'Coordenador'
    if (role === 'ANALISTA') return 'Supervisor'
    if (role === 'Coordenador' || role === 'Supervisor' || role === 'Gerente' || role === 'ADM') {
      return role
    }
    return 'Supervisor'
  }

  // Open Edit Modal
  const handleOpenEdit = (user: User) => {
    setEditingUser(user)
    setStoreSearchQuery('')
    const resolvedRole = normalizeRole(user.role)
    const initialLojas = Array.isArray(user.lojas) ? user.lojas : []
    // Mapeia os vínculos salvos para os IDs da lista carregada (aceita também
    // valores legados gravados como nome da loja)
    const resolvedInitialLojas = initialLojas.map((value) => {
      if (stores.some((s) => s.id === value)) return value
      const byName = stores.find((s) => s.name === value)
      if (byName) return byName.id
      // Comparação sem acentos (ex.: "SUIÇA" x "SUIÇA" com normalização distinta)
      const normalized = stores.find(
        (s) => normalizeStoreString(s.name) === normalizeStoreString(value),
      )
      return normalized ? normalized.id : value
    })
    setFormData({
      name: user.name || '',
      email: user.email || '',
      fone: formatPhoneNumber(user.fone || ''),
      password: '',
      passwordConfirm: '',
      role: resolvedRole,
      lojas: resolvedRole === 'Gerente' ? resolvedInitialLojas.slice(0, 1) : resolvedInitialLojas,
    })
    setShowPassword(false)
    setShowPasswordConfirm(false)
    setFormErrors({})
    setGeneralError(null)
    setModalOpen(true)
  }

  // Validation 100% client-side before sending to PocketBase
  const validateForm = () => {
    const errors: Record<string, string> = {}

    // Nome: obrigatório, não vazio
    if (!formData.name.trim()) {
      errors.name = 'O nome completo é obrigatório.'
    }

    // E-mail: formato válido com regex simples
    const emailValue = formData.email.trim()
    if (!emailValue) {
      errors.email = 'O e-mail é obrigatório.'
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(emailValue)) {
        errors.email = 'Insira um e-mail válido.'
      }
    }

    // Checagem local de unicidade do e-mail na lista carregada
    if (emailValue) {
      const existingWithEmail = users.find(
        (u) =>
          (u.email || '').toLowerCase() === emailValue.toLowerCase() && u.id !== editingUser?.id,
      )
      if (existingWithEmail) {
        errors.email = 'Este e-mail já está sendo utilizado por outro usuário.'
      }
    }

    // Senhas
    const passTrimmed = formData.password.trim()
    const passConfirmTrimmed = formData.passwordConfirm.trim()

    if (!editingUser) {
      // Cadastro novo: senha obrigatória, mín 8 chars
      if (!passTrimmed) {
        errors.password = 'A senha deve ter no mínimo 8 caracteres.'
      } else if (passTrimmed.length < 8) {
        errors.password = 'A senha deve ter no mínimo 8 caracteres.'
      }

      // Confirmar senha: deve coincidir exatamente
      if (!passConfirmTrimmed) {
        errors.passwordConfirm = 'Confirme a senha digitada.'
      } else if (passTrimmed !== passConfirmTrimmed) {
        errors.passwordConfirm = 'As senhas digitadas não coincidem.'
      }
    } else {
      // Edição: senha opcional. Se preenchida, mín 8 chars e confirmação idêntica
      if (passTrimmed || passConfirmTrimmed) {
        if (!passTrimmed || passTrimmed.length < 8) {
          errors.password = 'A senha deve ter no mínimo 8 caracteres.'
        }
        if (passTrimmed !== passConfirmTrimmed) {
          errors.passwordConfirm = 'As senhas digitadas não coincidem.'
        }
      }
    }
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) {
      setGeneralError('Verifique os campos destacados abaixo.')
      return false
    }

    setGeneralError(null)
    return true
  }

  // Helper para traduzir códigos e mensagens de erro do PocketBase
  const translateErrorMessage = (codeOrMsg: string, field?: string): string => {
    const text = String(codeOrMsg).toLowerCase()
    if (
      text.includes('unique') ||
      text.includes('not_unique') ||
      text.includes('validation_not_unique') ||
      text.includes('validation_is_not_unique')
    ) {
      return field === 'email' || field === 'username'
        ? 'Este e-mail já está cadastrado.'
        : 'Já existe um registro com este valor.'
    }
    if (
      text.includes('mismatch') ||
      text.includes('match') ||
      text.includes('validation_values_mismatch')
    ) {
      return 'As senhas digitadas não coincidem.'
    }
    if (
      text.includes('length') ||
      text.includes('out_of_range') ||
      text.includes('min 8') ||
      text.includes('min_length') ||
      text.includes('validation_length_out_of_range')
    ) {
      return field === 'password' || field === 'passwordConfirm'
        ? 'A senha deve ter no mínimo 8 caracteres.'
        : 'Tamanho inválido para este campo.'
    }
    if (
      text.includes('required') ||
      text.includes('validation_required') ||
      text.includes('missing')
    ) {
      return 'Este campo é obrigatório.'
    }
    if (
      text.includes('invalid_email') ||
      text.includes('validation_is_email') ||
      text.includes('email')
    ) {
      return 'Insira um e-mail válido.'
    }
    return codeOrMsg
  }

  // Converte a seleção do formulário para os IDs reais da coleção stores.
  // O backend grava users.lojas como relation por ID — nunca pelo nome.
  const resolveLojasForSubmit = (selected: string[]): string[] => {
    const resolved: string[] = []
    selected.forEach((value) => {
      if (storeMap.has(value)) {
        if (!resolved.includes(value)) resolved.push(value)
        return
      }
      const byName = stores.find((s) => s.name === value)
      if (byName) {
        if (!resolved.includes(byName.id)) resolved.push(byName.id)
        return
      }
      // Comparação sem acentos (nomes com Ç/acentos podem divergir na codificação)
      const normalized = stores.find(
        (s) => normalizeStoreString(s.name) === normalizeStoreString(value),
      )
      if (normalized && !resolved.includes(normalized.id)) resolved.push(normalized.id)
    })
    return resolved
  }

  // Handle Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setSubmitting(true)
    setGeneralError(null)
    setFormErrors({})

    const trimmedPassword = formData.password.trim()
    const trimmedPasswordConfirm = formData.passwordConfirm.trim()

    try {
      if (editingUser) {
        // Update user
        const normalizedEmail = (formData.email || '').trim().toLowerCase()
        const resolvedLojas =
          formData.role === 'ADM'
            ? []
            : formData.role === 'Gerente'
              ? formData.lojas.slice(0, 1)
              : formData.lojas

        const payload: Record<string, any> = {
          name: formData.name.trim(),
          email: normalizedEmail,
          emailVisibility: true,
          fone: formData.fone.trim(),
          role: formData.role,
          lojas: resolveLojasForSubmit(resolvedLojas),
        }

        // Só enviar password e passwordConfirm se forem preenchidas
        if (trimmedPassword.length > 0) {
          payload.password = trimmedPassword
          payload.passwordConfirm = trimmedPasswordConfirm
        }

        const updated = await pb.collection('users').update<User>(editingUser.id, payload)
        // Garante que os dados editados (incluindo email, fone e lojas) permaneçam no registro local
        const mergedUpdated: User = {
          ...editingUser,
          ...updated,
          name: payload.name,
          email: payload.email || updated.email || editingUser.email,
          fone: payload.fone,
          role: payload.role,
          lojas: payload.lojas,
        }

        // Se o usuário editou o próprio cadastro, sincroniza o authStore
        if (editingUser.id === currentUser?.id) {
          try {
            await pb.collection('users').authRefresh()
          } catch {
            // ignora falha de refresh
          }
        }

        setUsers((prev) => {
          const exists = prev.some((u) => u.id === mergedUpdated.id)
          if (!exists) return [mergedUpdated, ...prev]
          return prev.map((u) => (u.id === mergedUpdated.id ? mergedUpdated : u))
        })

        toast({
          title: 'Usuário atualizado com sucesso',
          description: `Os dados de ${updated.name || updated.email} foram atualizados.`,
        })
      } else {
        // Create user - NOTE: verified and emailVisibility omitted so non-superuser Admins can create records
        const normalizedEmail = (formData.email || '').trim().toLowerCase()
        const resolvedLojas =
          formData.role === 'ADM'
            ? []
            : formData.role === 'Gerente'
              ? formData.lojas.slice(0, 1)
              : formData.lojas

        const payload: Record<string, any> = {
          name: formData.name.trim(),
          email: normalizedEmail,
          emailVisibility: true,
          fone: formData.fone.trim(),
          role: formData.role,
          lojas: resolveLojasForSubmit(resolvedLojas),
          password: trimmedPassword,
          passwordConfirm: trimmedPasswordConfirm,
        }

        const created = await pb.collection('users').create<User>(payload)
        const mergedCreated: User = {
          ...created,
          name: payload.name,
          email: payload.email || created.email,
          fone: payload.fone,
          role: payload.role,
          lojas: payload.lojas,
        }

        setUsers((prev) => {
          if (prev.some((u) => u.id === mergedCreated.id)) return prev
          return [mergedCreated, ...prev]
        })

        toast({
          title: 'Usuário cadastrado com sucesso',
          description: `O usuário ${created.name || created.email} foi criado.`,
        })
      }

      setModalOpen(false)
    } catch (err: any) {
      console.error('Erro ao salvar usuário no PocketBase:', err)

      // Extração robusta de erros de validação no PocketBase SDK
      const rawSources: any[] = []
      if (
        err?.response &&
        typeof err.response === 'object' &&
        !(err.response instanceof Response)
      ) {
        if (err.response.data && typeof err.response.data === 'object') {
          rawSources.push(err.response.data)
        }
        rawSources.push(err.response)
      }
      if (err?.data && typeof err.data === 'object') {
        if (err.data.data && typeof err.data.data === 'object') {
          rawSources.push(err.data.data)
        }
        rawSources.push(err.data)
      }
      if (err?.originalError?.data && typeof err.originalError.data === 'object') {
        rawSources.push(err.originalError.data)
      }
      if (err?.cause?.data && typeof err.cause.data === 'object') {
        rawSources.push(err.cause.data)
      }

      const fieldErrors: Record<string, string> = {}
      const processedKeys = new Set<string>()

      for (const source of rawSources) {
        if (!source || typeof source !== 'object' || Array.isArray(source)) continue

        for (const [key, item] of Object.entries(source)) {
          if (['code', 'message', 'data', 'status', 'url'].includes(key)) continue
          if (processedKeys.has(key)) continue

          let itemCode = ''
          let itemMsg = ''

          if (item && typeof item === 'object') {
            const itemObj = item as { code?: string; message?: string }
            itemCode = itemObj.code || ''
            itemMsg = itemObj.message || ''
          } else if (typeof item === 'string' && item.trim().length > 0) {
            itemMsg = item
          }

          if (!itemCode && !itemMsg) continue

          const isMismatch =
            itemCode === 'validation_values_mismatch' ||
            (itemMsg || '').toLowerCase().includes('mismatch') ||
            (itemMsg || '').toLowerCase().includes('match')

          if (isMismatch && (key === 'password' || key === 'passwordConfirm')) {
            fieldErrors.passwordConfirm = 'As senhas digitadas não coincidem.'
            processedKeys.add('password')
            processedKeys.add('passwordConfirm')
            continue
          }

          const mappedKey = key === 'username' ? 'email' : key

          if (!fieldErrors[mappedKey]) {
            fieldErrors[mappedKey] = translateErrorMessage(itemCode || itemMsg, mappedKey)
            processedKeys.add(key)
          }
        }
      }

      setFormErrors(fieldErrors)

      const hasFieldErrors = Object.keys(fieldErrors).length > 0
      let fallbackMsg = ''
      if (hasFieldErrors) {
        setGeneralError('Verifique os campos destacados abaixo.')
      } else {
        fallbackMsg =
          typeof err?.message === 'string' && err.message.trim().length > 0
            ? translateErrorMessage(err.message)
            : 'Erro ao salvar usuário. Tente novamente.'
        setGeneralError(fallbackMsg)
      }

      const errorMsg = hasFieldErrors
        ? 'Verifique os campos destacados abaixo.'
        : fallbackMsg || 'Erro ao salvar usuário. Tente novamente.'

      toast({
        title: editingUser ? 'Erro ao atualizar usuário' : 'Erro ao cadastrar usuário',
        description: errorMsg,
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Delete User
  const handleDeleteUser = async () => {
    if (!userToDelete) return

    if (userToDelete.id === currentUser?.id) {
      toast({
        title: 'Ação não permitida',
        description: 'Você não pode excluir sua própria conta enquanto estiver logado.',
        variant: 'destructive',
      })
      setUserToDelete(null)
      return
    }

    setDeleting(true)
    try {
      await pb.collection('users').delete(userToDelete.id)
      setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id))
      toast({
        title: 'Usuário excluído',
        description: `O usuário ${userToDelete.name || userToDelete.email} foi removido com sucesso.`,
      })
      setUserToDelete(null)
    } catch (err: unknown) {
      console.error(err)
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir o usuário. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  // Store dictionary for lookup por ID (IDs reais da coleção stores)
  const storeMap = useMemo(() => {
    const map = new Map<string, StoreRecord>()
    stores.forEach((s) => map.set(s.id, s))
    return map
  }, [stores])

  // Statistics
  const stats = useMemo(() => {
    const total = users.length
    const adms = users.filter((u) => u.role === 'ADM').length
    const coordenadores = users.filter(
      (u) => u.role === 'Coordenador' || (u.role as string) === 'GESTOR',
    ).length
    const supervisores = users.filter(
      (u) => u.role === 'Supervisor' || (u.role as string) === 'ANALISTA',
    ).length
    const gerentes = users.filter((u) => u.role === 'Gerente').length
    return { total, adms, coordenadores, supervisores, gerentes }
  }, [users])

  // Filtered list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const uRole = normalizeRole(u.role)

      // Role filter
      if (roleFilter !== 'ALL') {
        if (uRole !== roleFilter) return false
      }

      // Search query
      if (search) {
        const q = (search || '').toLowerCase()
        const nameMatch = (u.name || '').toLowerCase().includes(q)
        const emailMatch = (u.email || '').toLowerCase().includes(q)
        const phoneMatch = (u.fone || '').toLowerCase().includes(q)
        const roleMatch = uRole.toLowerCase().includes(q)

        // Store names match
        const storeMatch = Array.isArray(u.lojas)
          ? u.lojas.some((storeId) => {
              const store = storeMap.get(storeId)
              return store ? store.name.toLowerCase().includes(q) : false
            })
          : false

        return nameMatch || emailMatch || phoneMatch || roleMatch || storeMatch
      }

      return true
    })
  }, [users, roleFilter, search, storeMap])

  // Filtered stores for modal search (busca rápida na lista fixa de lojas)
  const modalFilteredStores = useMemo(() => {
    const query = storeSearchQuery.trim()
    if (!query) return stores
    // Busca sem sensibilidade a acentos (ex.: "SUIÇA" encontra "SUICA")
    return stores.filter((s) => normalizeStoreString(s.name).includes(normalizeStoreString(query)))
  }, [stores, storeSearchQuery])

  // Helper badge for role
  const renderRoleBadge = (role?: string) => {
    const resolvedRole = normalizeRole(role)
    switch (resolvedRole) {
      case 'ADM':
        return (
          <Badge className="bg-[#12365A] hover:bg-[#0E2A47] text-white border-none text-[11px] font-semibold px-2.5 py-0.5 shadow-xs">
            <Shield className="w-3 h-3 mr-1 text-[#0E9F8A]" />
            ADM
          </Badge>
        )
      case 'Coordenador':
        return (
          <Badge className="bg-[#0284C7] hover:bg-[#0369A1] text-white border-none text-[11px] font-semibold px-2.5 py-0.5 shadow-xs">
            <UserCog className="w-3 h-3 mr-1 text-sky-200" />
            Coordenador
          </Badge>
        )
      case 'Supervisor':
        return (
          <Badge className="bg-[#0D9488] hover:bg-[#0F766E] text-white border-none text-[11px] font-semibold px-2.5 py-0.5 shadow-xs">
            <UserCheck className="w-3 h-3 mr-1 text-teal-200" />
            Supervisor
          </Badge>
        )
      case 'Gerente':
        return (
          <Badge className="bg-[#EA580C] hover:bg-[#C2410C] text-white border-none text-[11px] font-semibold px-2.5 py-0.5 shadow-xs">
            <Store className="w-3 h-3 mr-1 text-orange-200" />
            Gerente
          </Badge>
        )
      default:
        return (
          <Badge className="bg-[#64748B] hover:bg-[#475569] text-white border-none text-[11px] font-semibold px-2.5 py-0.5 shadow-xs">
            {resolvedRole}
          </Badge>
        )
    }
  }

  // Toggle store selection in form
  const handleToggleStore = (storeId: string) => {
    if (formData.role === 'Gerente') {
      // Single store selection: if clicking already selected, keep it or unselect. Let's toggle single.
      setFormData((prev) => ({
        ...prev,
        lojas: prev.lojas.includes(storeId) ? [] : [storeId],
      }))
    } else {
      // Multiple store selection
      setFormData((prev) => {
        const exists = prev.lojas.includes(storeId)
        const updated = exists
          ? prev.lojas.filter((id) => id !== storeId)
          : [...prev.lojas, storeId]
        return { ...prev, lojas: updated }
      })
    }
  }

  const handleSelectAllStores = () => {
    if (formData.role === 'Gerente') return
    // Usa os IDs reais da lista carregada (a lista fixa define apenas a ordem)
    const allIds = stores.map((s) => s.id)
    setFormData((prev) => ({
      ...prev,
      lojas: prev.lojas.length === stores.length && stores.length > 0 ? [] : allIds,
    }))
  }

  // Toggle handler for Reference Date permissions per profile
  const handleToggleRefPermission = async (
    dateStr: string,
    roleKey: 'gerente' | 'supervisor' | 'coordenador',
    currentVal: boolean,
  ) => {
    const existing = refPermissions.find((p) => p.referente?.trim() === dateStr.trim())
    const newVal = !currentVal
    const payload = {
      referente: dateStr.trim(),
      gerente: existing ? existing.gerente !== false : true,
      supervisor: existing ? existing.supervisor !== false : true,
      coordenador: existing ? existing.coordenador !== false : true,
      [roleKey]: newVal,
    }

    // Optimistic update
    const previousPermissions = [...refPermissions]
    setRefPermissions((prev) => {
      const idx = prev.findIndex((p) => p.referente?.trim() === dateStr.trim())
      if (idx >= 0) {
        const copy = [...prev]
        copy[idx] = { ...copy[idx], [roleKey]: newVal }
        return copy
      }
      return [
        ...prev,
        {
          id: `opt_${Date.now()}`,
          collectionId: 'reference_date_permissions',
          collectionName: 'reference_date_permissions',
          referente: dateStr.trim(),
          gerente: payload.gerente,
          supervisor: payload.supervisor,
          coordenador: payload.coordenador,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
      ]
    })

    const roleLabel =
      roleKey === 'gerente' ? 'Gerente' : roleKey === 'supervisor' ? 'Supervisão' : 'Coordenação'

    setSavingRefDate(`${dateStr}-${roleKey}`)

    try {
      const saved = await saveReferenceDatePermission(payload)
      setRefPermissions((prev) => {
        const idx = prev.findIndex((p) => p.referente?.trim() === dateStr.trim())
        if (idx >= 0) {
          const copy = [...prev]
          copy[idx] = saved
          return copy
        }
        return [...prev, saved]
      })
      toast({
        title: 'Permissão atualizada',
        description: `Data ${dateStr} ${newVal ? 'habilitada' : 'desabilitada'} para ${roleLabel}.`,
      })
    } catch (err) {
      console.error('Erro ao atualizar permissão de data de referência:', err)
      setRefPermissions(previousPermissions)
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível atualizar a permissão da data de referência.',
        variant: 'destructive',
      })
    } finally {
      setSavingRefDate(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card / Action Bar */}
      <div className="bg-white rounded-xl p-5 border border-[#E3E9F2] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#12365A] flex items-center justify-center text-white shadow-xs">
              <Shield className="w-5 h-5 text-[#0E9F8A]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#12365A] tracking-tight">Administração</h2>
              <p className="text-xs text-[#5B6B82]">Gerencie os usuários e perfis do sistema</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            onClick={loadData}
            disabled={loading}
            className="h-9 text-xs border-[#E3E9F2] text-[#5B6B82] hover:text-[#12233A] hover:bg-[#F8FAFC] gap-1.5"
            title="Recarregar usuários"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>

          <Button
            onClick={handleOpenCreate}
            className="bg-[#12365A] hover:bg-[#0E2A47] text-white font-semibold text-xs sm:text-sm h-9 px-4 gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4 text-[#0E9F8A]" />
            <span>Cadastrar Usuário</span>
          </Button>
        </div>
      </div>

      {/* Cards no topo: Total de usuários, ADMs, Coordenadores, Supervisores, Gerentes */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Usuários */}
        <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between col-span-2 sm:col-span-1">
          <div>
            <p className="text-[11px] font-semibold text-[#5B6B82] uppercase tracking-wider">
              Total Usuários
            </p>
            <p className="text-xl sm:text-2xl font-black text-[#12233A] mt-0.5">{stats.total}</p>
            <p className="text-[10px] text-[#8A97AC] mt-0.5">Acessos cadastrados</p>
          </div>
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#F0F5FC] border border-[#E3E9F2] flex items-center justify-center text-[#12365A] shrink-0">
            <Users className="w-5 h-5 text-[#12365A]" />
          </div>
        </div>

        {/* ADMs */}
        <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#12365A]" />
              <p className="text-[11px] font-semibold text-[#12365A] uppercase tracking-wider">
                ADMs
              </p>
            </div>
            <p className="text-xl sm:text-2xl font-black text-[#12365A] mt-0.5">{stats.adms}</p>
            <p className="text-[10px] text-[#5B6B82] mt-0.5">Acesso total</p>
          </div>
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#12365A]/10 border border-[#12365A]/20 flex items-center justify-center text-[#12365A] shrink-0">
            <Shield className="w-5 h-5 text-[#12365A]" />
          </div>
        </div>

        {/* Coordenadores */}
        <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#0284C7]" />
              <p className="text-[11px] font-semibold text-[#0284C7] uppercase tracking-wider">
                Coordenadores
              </p>
            </div>
            <p className="text-xl sm:text-2xl font-black text-[#0284C7] mt-0.5">
              {stats.coordenadores}
            </p>
            <p className="text-[10px] text-[#5B6B82] mt-0.5">Múltiplas lojas</p>
          </div>
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-[#0284C7] shrink-0">
            <UserCog className="w-5 h-5 text-[#0284C7]" />
          </div>
        </div>

        {/* Supervisores */}
        <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#0D9488]" />
              <p className="text-[11px] font-semibold text-[#0D9488] uppercase tracking-wider">
                Supervisores
              </p>
            </div>
            <p className="text-xl sm:text-2xl font-black text-[#0D9488] mt-0.5">
              {stats.supervisores}
            </p>
            <p className="text-[10px] text-[#5B6B82] mt-0.5">Múltiplas lojas</p>
          </div>
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-[#0D9488] shrink-0">
            <UserCheck className="w-5 h-5 text-[#0D9488]" />
          </div>
        </div>

        {/* Gerentes */}
        <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#EA580C]" />
              <p className="text-[11px] font-semibold text-[#EA580C] uppercase tracking-wider">
                Gerentes
              </p>
            </div>
            <p className="text-xl sm:text-2xl font-black text-[#EA580C] mt-0.5">{stats.gerentes}</p>
            <p className="text-[10px] text-[#5B6B82] mt-0.5">1 loja única</p>
          </div>
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#EA580C] shrink-0">
            <Store className="w-5 h-5 text-[#EA580C]" />
          </div>
        </div>
      </div>

      {/* Seção: Datas de Referência (Configuração de Visibilidade por Perfil) */}
      <div className="bg-white rounded-xl border border-[#E3E9F2] shadow-xs overflow-hidden">
        <div className="p-5 border-b border-[#E3E9F2] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-[#F8FAFC] to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#12365A]/10 flex items-center justify-center text-[#12365A] shrink-0 border border-[#12365A]/15">
              <Shield className="w-5 h-5 text-[#12365A]" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#12365A]/5 text-[#12365A] text-[10px] font-bold uppercase tracking-wider mb-1">
                <span>Controle de Apresentação</span>
              </div>
              <h3 className="text-base font-bold text-[#12365A]">Datas de Referência</h3>
              <p className="text-xs text-[#5B6B82]">
                Habilite ou desabilite quais datas de referência são apresentadas aos perfis de
                Gerente, Supervisão e Coordenação. O perfil <strong>ADM</strong> tem acesso
                irrestrito a todas as referências.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadReferenceDatesData}
            disabled={loadingRefDates}
            className="h-8 text-xs border-[#E3E9F2] text-[#5B6B82] hover:text-[#12365A] hover:bg-[#F8FAFC] gap-1.5 self-start sm:self-auto shrink-0"
            title="Atualizar datas de referência"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loadingRefDates && 'animate-spin')} />
            <span>Atualizar Datas</span>
          </Button>
        </div>

        {loadingRefDates ? (
          <div className="p-8 text-center text-[#5B6B82] flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-[#0E9F8A] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Carregando datas de referência...</span>
          </div>
        ) : refDates.length === 0 ? (
          <div className="p-8 text-center text-[#5B6B82] flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
            <AlertCircle className="w-8 h-8 text-[#8A97AC]" />
            <p className="font-semibold text-[#12365A] text-sm">
              Nenhuma Data de Referência encontrada
            </p>
            <p className="text-xs text-[#5B6B82]">
              Importe planilhas na tela de importação para registrar novas datas de referência no
              sistema.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#12365A] text-white font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3 min-w-[160px]">DATA DE REFERÊNCIA</th>
                  <th className="px-4 py-3 text-center min-w-[130px]">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#12365A] border border-white" />
                      <span>ADM</span>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center min-w-[140px]">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#EA580C]" />
                      <span>GERENTE</span>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center min-w-[140px]">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#0D9488]" />
                      <span>SUPERVISÃO</span>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center min-w-[140px]">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#0284C7]" />
                      <span>COORDENAÇÃO</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E9F2]">
                {refDates.map((dateStr, idx) => {
                  const perm = refPermissions.find((p) => p.referente?.trim() === dateStr.trim())
                  const isGerenteActive = perm ? perm.gerente !== false : true
                  const isSupervisorActive = perm ? perm.supervisor !== false : true
                  const isCoordenadorActive = perm ? perm.coordenador !== false : true

                  const isSavingGerente = savingRefDate === `${dateStr}-gerente`
                  const isSavingSupervisor = savingRefDate === `${dateStr}-supervisor`
                  const isSavingCoordenador = savingRefDate === `${dateStr}-coordenador`

                  return (
                    <tr
                      key={dateStr}
                      className={cn(
                        'hover:bg-[#F0F5FC] transition-colors',
                        idx % 2 === 1 ? 'bg-[#FAFCFF]' : 'bg-white',
                      )}
                    >
                      {/* Data de Referência */}
                      <td className="px-4 py-3.5 font-bold text-[#12365A] font-mono text-xs">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="bg-blue-50/70 text-[#12365A] border-blue-200 font-mono text-xs px-2.5 py-0.5"
                          >
                            {dateStr}
                          </Badge>
                        </div>
                      </td>

                      {/* ADM - Sempre ativo / incondicional */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Sempre Habilitado</span>
                        </div>
                      </td>

                      {/* Gerente Toggle */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            aria-label={`Habilitar ${dateStr} para Gerente`}
                            checked={isGerenteActive}
                            disabled={isSavingGerente}
                            onCheckedChange={() =>
                              handleToggleRefPermission(dateStr, 'gerente', isGerenteActive)
                            }
                            className="data-[state=checked]:bg-[#EA580C]"
                          />
                          <span
                            className={cn(
                              'text-[11px] font-semibold w-16 text-left',
                              isGerenteActive ? 'text-[#EA580C]' : 'text-slate-400',
                            )}
                          >
                            {isSavingGerente
                              ? 'Salvando...'
                              : isGerenteActive
                                ? 'Habilitado'
                                : 'Desativado'}
                          </span>
                        </div>
                      </td>

                      {/* Supervisor Toggle */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            aria-label={`Habilitar ${dateStr} para Supervisão`}
                            checked={isSupervisorActive}
                            disabled={isSavingSupervisor}
                            onCheckedChange={() =>
                              handleToggleRefPermission(dateStr, 'supervisor', isSupervisorActive)
                            }
                            className="data-[state=checked]:bg-[#0D9488]"
                          />
                          <span
                            className={cn(
                              'text-[11px] font-semibold w-16 text-left',
                              isSupervisorActive ? 'text-[#0D9488]' : 'text-slate-400',
                            )}
                          >
                            {isSavingSupervisor
                              ? 'Salvando...'
                              : isSupervisorActive
                                ? 'Habilitado'
                                : 'Desativado'}
                          </span>
                        </div>
                      </td>

                      {/* Coordenador Toggle */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            aria-label={`Habilitar ${dateStr} para Coordenação`}
                            checked={isCoordenadorActive}
                            disabled={isSavingCoordenador}
                            onCheckedChange={() =>
                              handleToggleRefPermission(dateStr, 'coordenador', isCoordenadorActive)
                            }
                            className="data-[state=checked]:bg-[#0284C7]"
                          />
                          <span
                            className={cn(
                              'text-[11px] font-semibold w-16 text-left',
                              isCoordenadorActive ? 'text-[#0284C7]' : 'text-slate-400',
                            )}
                          >
                            {isSavingCoordenador
                              ? 'Salvando...'
                              : isCoordenadorActive
                                ? 'Habilitado'
                                : 'Desativado'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Users Table Card */}
      <div className="bg-white rounded-xl border border-[#E3E9F2] shadow-xs overflow-hidden">
        {/* Filters and search bar */}
        <div className="p-4 border-b border-[#E3E9F2] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-[#8A97AC] absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Buscar por nome, e-mail, telefone ou loja..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs bg-[#F8FAFC] border-[#E3E9F2]"
            />
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <span className="text-xs font-semibold text-[#5B6B82] uppercase">Perfil:</span>
            <div className="inline-flex rounded-lg border border-[#E3E9F2] p-0.5 bg-[#F8FAFC] flex-wrap gap-0.5">
              <button
                onClick={() => setRoleFilter('ALL')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  roleFilter === 'ALL'
                    ? 'bg-[#12365A] text-white shadow-xs'
                    : 'text-[#5B6B82] hover:text-[#12233A]',
                )}
              >
                Todos ({users.length})
              </button>
              <button
                onClick={() => setRoleFilter('ADM')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  roleFilter === 'ADM'
                    ? 'bg-[#12365A] text-white shadow-xs'
                    : 'text-[#5B6B82] hover:text-[#12233A]',
                )}
              >
                ADM
              </button>
              <button
                onClick={() => setRoleFilter('Coordenador')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  roleFilter === 'Coordenador'
                    ? 'bg-[#0284C7] text-white shadow-xs'
                    : 'text-[#5B6B82] hover:text-[#12233A]',
                )}
              >
                Coordenador
              </button>
              <button
                onClick={() => setRoleFilter('Supervisor')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  roleFilter === 'Supervisor'
                    ? 'bg-[#0D9488] text-white shadow-xs'
                    : 'text-[#5B6B82] hover:text-[#12233A]',
                )}
              >
                Supervisor
              </button>
              <button
                onClick={() => setRoleFilter('Gerente')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  roleFilter === 'Gerente'
                    ? 'bg-[#EA580C] text-white shadow-xs'
                    : 'text-[#5B6B82] hover:text-[#12233A]',
                )}
              >
                Gerente
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#12365A] text-white font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3.5 min-w-[200px]">NOME COMPLETO</th>
                <th className="px-4 py-3.5 min-w-[200px]">E-MAIL</th>
                <th className="px-4 py-3.5 min-w-[130px]">FONE</th>
                <th className="px-4 py-3.5 min-w-[120px]">PERFIL</th>
                <th className="px-4 py-3.5 min-w-[240px]">LOJAS VINCULADAS</th>
                <th className="px-4 py-3.5 text-right min-w-[90px]">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E9F2]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-[#0E9F8A] border-t-transparent rounded-full animate-spin" />
                      <span>Carregando usuários...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <AlertCircle className="w-8 h-8 text-[#8A97AC]" />
                      <p className="font-semibold text-[#12365A]">Nenhum usuário encontrado</p>
                      <p className="text-xs text-[#5B6B82]">
                        {search || roleFilter !== 'ALL'
                          ? 'Tente ajustar os filtros ou a busca digitada.'
                          : 'Clique em "Cadastrar Usuário" para adicionar o primeiro acesso.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u, idx) => {
                  const isCurrent = u.id === currentUser?.id
                  const userLojas = Array.isArray(u.lojas) ? u.lojas : []
                  const userRole = normalizeRole(u.role)

                  return (
                    <tr
                      key={u.id}
                      className={cn(
                        'hover:bg-[#F0F5FC] transition-colors',
                        idx % 2 === 1 ? 'bg-[#FAFCFF]' : 'bg-white',
                      )}
                    >
                      {/* NOME COMPLETO */}
                      <td className="px-4 py-3.5 font-medium text-[#12365A]">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#12365A]/10 text-[#12365A] font-bold text-xs flex items-center justify-center shrink-0">
                            {(u.name?.charAt(0) || u.email?.charAt(0) || 'U').toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-[#12365A] block truncate">
                              {u.name || 'Sem nome cadastrado'}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] text-[#0E9F8A] font-semibold">
                                (Você)
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* E-MAIL */}
                      <td className="px-4 py-3.5 text-[#5B6B82] font-mono text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{u.email}</span>
                        </div>
                      </td>

                      {/* FONE */}
                      <td className="px-4 py-3.5 text-[#5B6B82]">
                        {u.fone ? (
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{u.fone}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300 italic">—</span>
                        )}
                      </td>

                      {/* PERFIL (BADGE) */}
                      <td className="px-4 py-3.5">{renderRoleBadge(u.role)}</td>

                      {/* LOJAS VINCULADAS */}
                      <td className="px-4 py-3.5">
                        {userRole === 'ADM' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-[#5B6B82]">
                            <Shield className="w-3 h-3 text-[#12365A]" />
                            Todas as lojas (Acesso Total)
                          </span>
                        ) : userLojas.length === 0 ? (
                          <span className="text-slate-400 text-[11px] italic">
                            Nenhuma loja vinculada
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-sm">
                            {userLojas.slice(0, 3).map((storeId) => {
                              const store = storeMap.get(storeId)
                              return (
                                <Badge
                                  key={storeId}
                                  variant="outline"
                                  className="text-[10px] font-semibold py-0.5 px-2 bg-blue-50/60 text-[#12365A] border-blue-200 truncate max-w-[160px]"
                                  title={store?.name || storeId}
                                >
                                  <Store className="w-2.5 h-2.5 mr-1 text-[#0E9F8A] shrink-0" />
                                  <span className="truncate">{store ? store.name : storeId}</span>
                                </Badge>
                              )
                            })}
                            {userLojas.length > 3 && (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-bold py-0.5 px-1.5 bg-slate-100 text-[#5B6B82] border-slate-200"
                                title={userLojas
                                  .slice(3)
                                  .map((id) => storeMap.get(id)?.name || id)
                                  .join(', ')}
                              >
                                +{userLojas.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                      </td>

                      {/* AÇÕES */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(u)}
                            className="h-8 w-8 p-0 text-slate-500 hover:text-[#12365A] hover:bg-slate-100"
                            title="Editar usuário"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setUserToDelete(u)}
                            disabled={isCurrent}
                            className={cn(
                              'h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50',
                              isCurrent && 'opacity-30 cursor-not-allowed',
                            )}
                            title={
                              isCurrent
                                ? 'Não é possível excluir seu próprio usuário'
                                : 'Excluir usuário'
                            }
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Cadastro / Edição de Usuário */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-xl bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-[#12365A] flex items-center justify-center text-white">
                {editingUser ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </div>
              <DialogTitle className="text-lg font-bold text-[#12365A]">
                {editingUser ? 'Editar Usuário' : 'Cadastrar Novo Usuário'}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-[#5B6B82]">
              {editingUser
                ? `Atualize os dados, o perfil e as lojas vinculadas de ${editingUser.name || editingUser.email}.`
                : 'Preencha os campos abaixo e vincule as lojas correspondentes ao perfil.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {/* General Error Banner */}
            {generalError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-red-700 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                <div className="flex-1">
                  <p className="font-semibold text-red-800">Erro ao salvar usuário</p>
                  <p className="mt-0.5 leading-relaxed">{generalError}</p>
                </div>
              </div>
            )}

            {/* Nome Completo e Fone em grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Nome Completo */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-[#12365A] flex items-center gap-1">
                  <UserIcon className="w-3.5 h-3.5 text-[#5B6B82]" />
                  Nome Completo *
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value })
                    if (formErrors.name) setFormErrors({ ...formErrors, name: '' })
                  }}
                  placeholder="Ex: Carlos Eduardo Silva"
                  className={cn(
                    'text-xs bg-[#F8FAFC]',
                    Boolean(formErrors.name) && 'border-red-500 focus-visible:ring-red-400',
                  )}
                  required
                />
                {Boolean(formErrors.name) && (
                  <p className="text-[11px] text-red-600 font-medium">{formErrors.name}</p>
                )}
              </div>

              {/* Telefone / Fone */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-[#12365A] flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-[#5B6B82]" />
                  Telefone / Celular
                </label>
                <Input
                  type="tel"
                  value={formData.fone}
                  onChange={(e) => {
                    const masked = formatPhoneNumber(e.target.value)
                    setFormData({ ...formData, fone: masked })
                    if (formErrors.fone) setFormErrors({ ...formErrors, fone: '' })
                  }}
                  placeholder="Ex: (61) 98765-4321"
                  className={cn(
                    'text-xs bg-[#F8FAFC]',
                    Boolean(formErrors.fone) && 'border-red-500 focus-visible:ring-red-400',
                  )}
                />
                {Boolean(formErrors.fone) && (
                  <p className="text-[11px] text-red-600 font-medium">{formErrors.fone}</p>
                )}
              </div>
            </div>

            {/* E-mail e Perfil em grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* E-mail */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-[#12365A] flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-[#5B6B82]" />
                  E-mail *
                </label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value })
                    if (formErrors.email) setFormErrors({ ...formErrors, email: '' })
                  }}
                  placeholder="Ex: carlos.silva@celnet.com.br"
                  className={cn(
                    'text-xs bg-[#F8FAFC]',
                    Boolean(formErrors.email) && 'border-red-500 focus-visible:ring-red-400',
                  )}
                  required
                />
                {Boolean(formErrors.email) && (
                  <p className="text-[11px] text-red-600 font-medium">{formErrors.email}</p>
                )}
              </div>

              {/* Perfil (Role) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-[#12365A] flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-[#5B6B82]" />
                  Perfil de Acesso *
                </label>
                <Select
                  value={formData.role}
                  onValueChange={(val: UserRole) => {
                    setFormData((prev) => ({
                      ...prev,
                      role: val,
                      lojas:
                        val === 'ADM'
                          ? []
                          : val === 'Gerente'
                            ? prev.lojas.slice(0, 1)
                            : prev.lojas,
                    }))
                    if (formErrors.role) setFormErrors({ ...formErrors, role: '' })
                  }}
                >
                  <SelectTrigger
                    className={cn(
                      'w-full text-xs bg-[#F8FAFC] h-9',
                      Boolean(formErrors.role) && 'border-red-500 focus:ring-red-400',
                    )}
                  >
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="ADM" className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#12365A]" />
                        <span className="font-bold text-[#12365A]">ADM</span>
                        <span className="text-[#8A97AC] text-[10px]">
                          — Acesso total ao sistema
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="Coordenador" className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#0284C7]" />
                        <span className="font-bold text-[#0284C7]">Coordenador</span>
                        <span className="text-[#8A97AC] text-[10px]">
                          — Gestão de múltiplas lojas
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="Supervisor" className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#0D9488]" />
                        <span className="font-bold text-[#0D9488]">Supervisor</span>
                        <span className="text-[#8A97AC] text-[10px]">
                          — Supervisão de múltiplas lojas
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="Gerente" className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#EA580C]" />
                        <span className="font-bold text-[#EA580C]">Gerente</span>
                        <span className="text-[#8A97AC] text-[10px]">— Gestão de 1 loja única</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {Boolean(formErrors.role) && (
                  <p className="text-[11px] text-red-600 font-medium">{formErrors.role}</p>
                )}
              </div>
            </div>

            {/* SEÇÃO: VÍNCULO DE LOJAS */}
            {formData.role !== 'ADM' && (
              <div className="p-3.5 bg-[#F8FAFC] border border-[#E3E9F2] rounded-xl space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold uppercase text-[#12365A] flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5 text-[#0E9F8A]" />
                      Lojas Vinculadas
                      <Badge
                        variant="outline"
                        className="text-[10px] font-semibold py-0 px-1.5 ml-1 bg-white"
                      >
                        {formData.lojas.length}{' '}
                        {formData.lojas.length === 1 ? 'loja selecionada' : 'lojas selecionadas'}
                      </Badge>
                    </label>
                    <p className="text-[11px] text-[#5B6B82] mt-0.5">
                      {formData.role === 'Gerente'
                        ? 'Selecione a loja única sob responsabilidade do gerente.'
                        : 'Selecione uma ou mais lojas geridas por este perfil.'}
                    </p>
                  </div>

                  {formData.role !== 'Gerente' && stores.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAllStores}
                      className="text-[11px] font-semibold text-[#0E9F8A] hover:underline self-start sm:self-auto"
                    >
                      {formData.lojas.length === stores.length
                        ? 'Desmarcar todas'
                        : 'Selecionar todas'}
                    </button>
                  )}
                </div>

                {/* Busca rápida de lojas no modal se houver muitas lojas */}
                {stores.length > 6 && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[#8A97AC] absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <Input
                      placeholder="Filtrar lojas na lista..."
                      value={storeSearchQuery}
                      onChange={(e) => setStoreSearchQuery(e.target.value)}
                      className="pl-8 h-7 text-xs bg-white border-[#E3E9F2]"
                    />
                  </div>
                )}

                {/* Lista selecionável de lojas (lista fixa) */}
                <div className="max-h-48 overflow-y-auto border border-[#E3E9F2] rounded-lg bg-white divide-y divide-slate-100">
                  {modalFilteredStores.length === 0 ? (
                    <div className="p-3 text-center text-xs text-[#8A97AC]">
                      Nenhuma loja encontrada para "{storeSearchQuery}".
                    </div>
                  ) : (
                    modalFilteredStores.map((store) => {
                      const isSelected = formData.lojas.includes(store.id)

                      return (
                        <div
                          key={store.id}
                          onClick={() => handleToggleStore(store.id)}
                          className={cn(
                            'flex items-center justify-between p-2.5 cursor-pointer transition-colors text-xs',
                            isSelected
                              ? 'bg-[#F0F5FC] text-[#12365A] font-semibold'
                              : 'hover:bg-slate-50 text-slate-700',
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={cn(
                                'w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0',
                                formData.role === 'Gerente' ? 'rounded-full' : 'rounded',
                                isSelected
                                  ? 'bg-[#12365A] border-[#12365A] text-white'
                                  : 'border-slate-300 bg-white',
                              )}
                            >
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <span className="truncate">{store.name}</span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {formData.role === 'Gerente' && formData.lojas.length === 0 && (
                  <p className="text-[11px] text-amber-600 font-medium">
                    Aviso: O perfil Gerente requer a seleção de 1 loja.
                  </p>
                )}
              </div>
            )}

            {formData.role === 'ADM' && (
              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl text-xs text-[#12365A] flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#0E9F8A] shrink-0" />
                <span>
                  Usuários com perfil <strong>ADM</strong> têm acesso irrestrito a todas as lojas da
                  rede e não requerem vínculo manual.
                </span>
              </div>
            )}

            {/* Senhas em grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Senha */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-[#12365A] flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-[#5B6B82]" />
                    Senha {editingUser ? '(Opcional)' : '*'}
                  </span>
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => {
                      setFormData({ ...formData, password: e.target.value })
                      if (formErrors.password) setFormErrors({ ...formErrors, password: '' })
                    }}
                    placeholder={editingUser ? 'Deixe em branco p/ manter' : 'Mínimo 8 caracteres'}
                    className={cn(
                      'text-xs bg-[#F8FAFC] pr-8',
                      Boolean(formErrors.password) && 'border-red-500 focus-visible:ring-red-400',
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#12365A] p-1 transition-colors focus:outline-none"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                {Boolean(formErrors.password) && (
                  <p className="text-[11px] text-red-600 font-medium">{formErrors.password}</p>
                )}
              </div>

              {/* Confirmação de Senha */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-[#12365A] flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-[#5B6B82]" />
                    Confirmar Senha {editingUser ? '(Opcional)' : '*'}
                  </span>
                </label>
                <div className="relative">
                  <Input
                    type={showPasswordConfirm ? 'text' : 'password'}
                    value={formData.passwordConfirm}
                    onChange={(e) => {
                      setFormData({ ...formData, passwordConfirm: e.target.value })
                      if (formErrors.passwordConfirm)
                        setFormErrors({ ...formErrors, passwordConfirm: '' })
                    }}
                    placeholder={editingUser ? 'Confirme caso altere' : 'Repita a senha'}
                    className={cn(
                      'text-xs bg-[#F8FAFC] pr-8',
                      Boolean(formErrors.passwordConfirm) &&
                        'border-red-500 focus-visible:ring-red-400',
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordConfirm((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#12365A] p-1 transition-colors focus:outline-none"
                    tabIndex={-1}
                    aria-label={
                      showPasswordConfirm
                        ? 'Ocultar confirmação de senha'
                        : 'Exibir confirmação de senha'
                    }
                  >
                    {showPasswordConfirm ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                {Boolean(formErrors.passwordConfirm) && (
                  <p className="text-[11px] text-red-600 font-medium">
                    {formErrors.passwordConfirm}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="pt-3 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-[#12365A] hover:bg-[#0E2A47] text-white text-xs font-semibold gap-1.5"
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#0E9F8A]" />
                    <span>{editingUser ? 'Atualizar Usuário' : 'Cadastrar Usuário'}</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmar Exclusão de Usuário */}
      <Dialog
        open={!!userToDelete}
        onOpenChange={(open) => !open && !deleting && setUserToDelete(null)}
      >
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-2">
              <Trash2 className="w-5 h-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-[#12365A]">
              Confirmar exclusão de usuário
            </DialogTitle>
            <DialogDescription className="text-xs text-[#5B6B82] leading-relaxed">
              Tem certeza de que deseja remover o usuário{' '}
              <strong className="text-[#12365A]">
                {userToDelete?.name || userToDelete?.email}
              </strong>{' '}
              ({userToDelete?.email})? Este usuário perderá o acesso imediato ao sistema.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              onClick={() => setUserToDelete(null)}
              disabled={deleting}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={deleting}
              className="text-xs bg-red-600 hover:bg-red-700 gap-1.5"
            >
              {deleting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Excluindo...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Sim, excluir usuário</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Admin
