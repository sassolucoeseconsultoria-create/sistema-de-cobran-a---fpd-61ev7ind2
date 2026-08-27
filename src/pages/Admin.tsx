import React, { useState, useEffect, useMemo } from 'react'
import {
  Users,
  Shield,
  Briefcase,
  UserCheck,
  Plus,
  Search,
  Trash2,
  Pencil,
  AlertCircle,
  Phone,
  Mail,
  Lock,
  User as UserIcon,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth, type UserRole, type User } from '@/contexts/AuthContext'
import { extractFieldErrors, getErrorMessage } from '@/lib/pocketbase/errors'
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

export const Admin: React.FC = () => {
  const { user: currentUser } = useAuth()
  const { toast } = useToast()

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL')

  // Modal State for Create / Edit
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    fone: '',
    password: '',
    passwordConfirm: '',
    role: 'ANALISTA' as UserRole,
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Delete modal state
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Fetch Users
  const loadUsers = async () => {
    try {
      setLoading(true)
      const list = await pb.collection('users').getFullList<User>({
        sort: '-created',
      })
      setUsers(list)
    } catch (err: unknown) {
      console.error(err)
      toast({
        title: 'Erro ao carregar usuários',
        description: 'Não foi possível buscar os usuários cadastrados.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  // Realtime updates for users collection
  useRealtime<User>('users', (e) => {
    if (e.action === 'create') {
      setUsers((prev) => {
        if (prev.some((u) => u.id === e.record.id)) return prev
        return [e.record, ...prev]
      })
    } else if (e.action === 'update') {
      setUsers((prev) => prev.map((u) => (u.id === e.record.id ? e.record : u)))
    } else if (e.action === 'delete') {
      setUsers((prev) => prev.filter((u) => u.id !== e.record.id))
    }
  })

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingUser(null)
    setFormData({
      name: '',
      email: '',
      fone: '',
      password: '',
      passwordConfirm: '',
      role: 'ANALISTA',
    })
    setFormErrors({})
    setGeneralError(null)
    setModalOpen(true)
  }

  // Open Edit Modal
  const handleOpenEdit = (user: User) => {
    setEditingUser(user)
    setFormData({
      name: user.name || '',
      email: user.email || '',
      fone: user.fone || '',
      password: '',
      passwordConfirm: '',
      role: (user.role as UserRole) || 'ANALISTA',
    })
    setFormErrors({})
    setGeneralError(null)
    setModalOpen(true)
  }

  // Validation
  const validateForm = () => {
    const errors: Record<string, string> = {}

    if (!formData.name.trim()) {
      errors.name = 'O nome completo é obrigatório.'
    }

    if (!formData.email.trim()) {
      errors.email = 'O e-mail é obrigatório.'
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.email.trim())) {
        errors.email = 'Insira um e-mail válido.'
      }
    }

    // Check email uniqueness locally
    const existingWithEmail = users.find(
      (u) =>
        u.email.toLowerCase() === formData.email.trim().toLowerCase() && u.id !== editingUser?.id,
    )
    if (existingWithEmail) {
      errors.email = 'Este e-mail já está sendo utilizado por outro usuário.'
    }

    // Password validation: PocketBase auth requires min 8 chars
    if (!editingUser) {
      // Create mode: password is required, min 8 chars
      if (!formData.password) {
        errors.password = 'A senha é obrigatória para novos usuários.'
      } else if (formData.password.length < 8) {
        errors.password = 'A senha deve ter no mínimo 8 caracteres.'
      }

      if (!formData.passwordConfirm) {
        errors.passwordConfirm = 'Confirme a senha.'
      } else if (formData.password !== formData.passwordConfirm) {
        errors.passwordConfirm = 'As senhas digitadas não coincidem.'
      }
    } else {
      // Edit mode: password optional, if provided min 8 chars
      if (formData.password) {
        if (formData.password.length < 8) {
          errors.password = 'A nova senha deve ter no mínimo 8 caracteres.'
        }
        if (formData.password !== formData.passwordConfirm) {
          errors.passwordConfirm = 'As senhas digitadas não coincidem.'
        }
      }
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Handle Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setSubmitting(true)
    setGeneralError(null)

    try {
      if (editingUser) {
        // Update user
        const payload: Record<string, any> = {
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          fone: formData.fone.trim(),
          role: formData.role,
        }

        if (formData.password.trim()) {
          payload.password = formData.password.trim()
          payload.passwordConfirm = (formData.passwordConfirm || formData.password).trim()
        }

        const updated = await pb.collection('users').update<User>(editingUser.id, payload)
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))

        toast({
          title: 'Usuário atualizado com sucesso',
          description: `Os dados de ${updated.name || updated.email} foram atualizados.`,
        })
      } else {
        // Create user
        const payload: Record<string, any> = {
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          fone: formData.fone.trim(),
          role: formData.role,
          password: formData.password.trim(),
          passwordConfirm: formData.passwordConfirm.trim() || formData.password.trim(),
          emailVisibility: true,
          verified: true,
        }

        const created = await pb.collection('users').create<User>(payload)
        setUsers((prev) => [created, ...prev])

        toast({
          title: 'Usuário cadastrado com sucesso',
          description: `O usuário ${created.name || created.email} foi criado.`,
        })
      }

      setModalOpen(false)
    } catch (err: unknown) {
      console.error('Erro ao salvar usuário:', err)

      // Extrai erros específicos por campo
      const fieldErrors = extractFieldErrors(err)
      const errorMsg = getErrorMessage(err)

      if (Object.keys(fieldErrors).length > 0) {
        setFormErrors((prev) => ({
          ...prev,
          ...fieldErrors,
        }))
        setGeneralError('Por favor, corrija os campos destacados abaixo.')
      } else {
        setGeneralError(errorMsg)
      }

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

  // Statistics
  const stats = useMemo(() => {
    const total = users.length
    const adms = users.filter((u) => u.role === 'ADM').length
    const gestores = users.filter((u) => u.role === 'GESTOR').length
    const analistas = users.filter((u) => !u.role || u.role === 'ANALISTA').length
    return { total, adms, gestores, analistas }
  }, [users])

  // Filtered list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Role filter
      if (roleFilter !== 'ALL') {
        const uRole = u.role || 'ANALISTA'
        if (uRole !== roleFilter) return false
      }

      // Search query
      if (search) {
        const q = search.toLowerCase()
        const nameMatch = (u.name || '').toLowerCase().includes(q)
        const emailMatch = (u.email || '').toLowerCase().includes(q)
        const phoneMatch = (u.fone || '').toLowerCase().includes(q)
        const roleMatch = (u.role || 'ANALISTA').toLowerCase().includes(q)
        return nameMatch || emailMatch || phoneMatch || roleMatch
      }

      return true
    })
  }, [users, roleFilter, search])

  // Helper badge for role
  const renderRoleBadge = (role?: string) => {
    switch (role) {
      case 'ADM':
        return (
          <Badge className="bg-[#12365A] hover:bg-[#0E2A47] text-white border-none text-[11px] font-semibold px-2.5 py-0.5 shadow-xs">
            <Shield className="w-3 h-3 mr-1 text-[#0E9F8A]" />
            ADM
          </Badge>
        )
      case 'GESTOR':
        return (
          <Badge className="bg-[#EA580C] hover:bg-[#C2410C] text-white border-none text-[11px] font-semibold px-2.5 py-0.5 shadow-xs">
            <Briefcase className="w-3 h-3 mr-1 text-orange-200" />
            GESTOR
          </Badge>
        )
      case 'ANALISTA':
      default:
        return (
          <Badge className="bg-[#64748B] hover:bg-[#475569] text-white border-none text-[11px] font-semibold px-2.5 py-0.5 shadow-xs">
            <UserCheck className="w-3 h-3 mr-1 text-slate-200" />
            ANALISTA
          </Badge>
        )
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
            onClick={loadUsers}
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

      {/* Cards no topo: Total de usuários, ADMs, GESTORs, ANALISTAs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Usuários */}
        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-[#5B6B82] uppercase tracking-wider">
              Total de Usuários
            </p>
            <p className="text-2xl font-black text-[#12233A] mt-1">{stats.total}</p>
            <p className="text-[11px] text-[#8A97AC] mt-0.5">Acessos cadastrados</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#F0F5FC] border border-[#E3E9F2] flex items-center justify-center text-[#12365A]">
            <Users className="w-6 h-6 text-[#12365A]" />
          </div>
        </div>

        {/* ADMs */}
        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#12365A]" />
              <p className="text-xs font-semibold text-[#12365A] uppercase tracking-wider">ADMs</p>
            </div>
            <p className="text-2xl font-black text-[#12365A] mt-1">{stats.adms}</p>
            <p className="text-[11px] text-[#5B6B82] mt-0.5">Acesso total ao sistema</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#12365A]/10 border border-[#12365A]/20 flex items-center justify-center text-[#12365A]">
            <Shield className="w-6 h-6 text-[#12365A]" />
          </div>
        </div>

        {/* GESTORs */}
        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#EA580C]" />
              <p className="text-xs font-semibold text-[#EA580C] uppercase tracking-wider">
                Gestores
              </p>
            </div>
            <p className="text-2xl font-black text-[#EA580C] mt-1">{stats.gestores}</p>
            <p className="text-[11px] text-[#5B6B82] mt-0.5">Gestão e acompanhamento</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#EA580C]">
            <Briefcase className="w-6 h-6 text-[#EA580C]" />
          </div>
        </div>

        {/* ANALISTAs */}
        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#64748B]" />
              <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                Analistas
              </p>
            </div>
            <p className="text-2xl font-black text-[#64748B] mt-1">{stats.analistas}</p>
            <p className="text-[11px] text-[#5B6B82] mt-0.5">Operação e visualização</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-[#64748B]">
            <UserCheck className="w-6 h-6 text-[#64748B]" />
          </div>
        </div>
      </div>

      {/* Users Table Card */}
      <div className="bg-white rounded-xl border border-[#E3E9F2] shadow-xs overflow-hidden">
        {/* Filters and search bar */}
        <div className="p-4 border-b border-[#E3E9F2] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-[#8A97AC] absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Buscar por nome, e-mail ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs bg-[#F8FAFC] border-[#E3E9F2]"
            />
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs font-semibold text-[#5B6B82] uppercase">Perfil:</span>
            <div className="inline-flex rounded-lg border border-[#E3E9F2] p-0.5 bg-[#F8FAFC]">
              <button
                onClick={() => setRoleFilter('ALL')}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-all',
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
                  'px-3 py-1 rounded-md text-xs font-medium transition-all',
                  roleFilter === 'ADM'
                    ? 'bg-[#12365A] text-white shadow-xs'
                    : 'text-[#5B6B82] hover:text-[#12233A]',
                )}
              >
                ADM
              </button>
              <button
                onClick={() => setRoleFilter('GESTOR')}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-all',
                  roleFilter === 'GESTOR'
                    ? 'bg-[#EA580C] text-white shadow-xs'
                    : 'text-[#5B6B82] hover:text-[#12233A]',
                )}
              >
                GESTOR
              </button>
              <button
                onClick={() => setRoleFilter('ANALISTA')}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-all',
                  roleFilter === 'ANALISTA'
                    ? 'bg-[#64748B] text-white shadow-xs'
                    : 'text-[#5B6B82] hover:text-[#12233A]',
                )}
              >
                ANALISTA
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#12365A] text-white font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3.5 min-w-[220px]">NOME COMPLETO</th>
                <th className="px-4 py-3.5 min-w-[220px]">E-MAIL</th>
                <th className="px-4 py-3.5 min-w-[150px]">FONE</th>
                <th className="px-4 py-3.5 min-w-[130px]">PERFIL</th>
                <th className="px-4 py-3.5 text-right min-w-[100px]">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E9F2]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-[#0E9F8A] border-t-transparent rounded-full animate-spin" />
                      <span>Carregando usuários...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-[#5B6B82]">
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
                            {u.name?.charAt(0).toUpperCase() || u.email.charAt(0).toUpperCase()}
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
        <DialogContent className="sm:max-w-md bg-white">
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
                ? `Atualize os dados e o perfil de acesso de ${editingUser.name || editingUser.email}.`
                : 'Preencha os campos abaixo para conceder acesso ao sistema.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {/* General Error Banner */}
            {generalError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-red-700 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                <div className="flex-1">
                  <p className="font-semibold text-red-800">Falha ao salvar</p>
                  <p className="mt-0.5 leading-relaxed">{generalError}</p>
                </div>
              </div>
            )}

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
                className={cn('text-xs bg-[#F8FAFC]', formErrors.name && 'border-red-500')}
                required
              />
              {formErrors.name && (
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
                  setFormData({ ...formData, fone: e.target.value })
                }}
                placeholder="Ex: (61) 98765-4321"
                className="text-xs bg-[#F8FAFC]"
              />
            </div>

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
                className={cn('text-xs bg-[#F8FAFC]', formErrors.email && 'border-red-500')}
                required
              />
              {formErrors.email && (
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
                onValueChange={(val: UserRole) => setFormData({ ...formData, role: val })}
              >
                <SelectTrigger className="w-full text-xs bg-[#F8FAFC] h-9">
                  <SelectValue placeholder="Selecione o perfil" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="ADM" className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#12365A]" />
                      <span className="font-bold text-[#12365A]">ADM</span>
                      <span className="text-[#8A97AC] text-[10px]">— Acesso total e gestão</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="GESTOR" className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#EA580C]" />
                      <span className="font-bold text-[#EA580C]">GESTOR</span>
                      <span className="text-[#8A97AC] text-[10px]">— Gestão e acompanhamento</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="ANALISTA" className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#64748B]" />
                      <span className="font-bold text-[#64748B]">ANALISTA</span>
                      <span className="text-[#8A97AC] text-[10px]">
                        — Visualização e relatórios
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Senha */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-[#12365A] flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-[#5B6B82]" />
                  Senha {editingUser ? '(Opcional)' : '*'}
                </span>
                <span className="text-[10px] text-slate-500 font-normal">
                  {editingUser ? 'Deixe vazio para manter' : 'Mínimo 8 caracteres'}
                </span>
              </label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => {
                  setFormData({ ...formData, password: e.target.value })
                  if (formErrors.password) setFormErrors({ ...formErrors, password: '' })
                }}
                placeholder={
                  editingUser ? 'Deixe em branco para manter a senha atual' : 'Mínimo 8 caracteres'
                }
                className={cn('text-xs bg-[#F8FAFC]', formErrors.password && 'border-red-500')}
              />
              {formErrors.password && (
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
              <Input
                type="password"
                value={formData.passwordConfirm}
                onChange={(e) => {
                  setFormData({ ...formData, passwordConfirm: e.target.value })
                  if (formErrors.passwordConfirm)
                    setFormErrors({ ...formErrors, passwordConfirm: '' })
                }}
                placeholder={
                  editingUser
                    ? 'Confirme a nova senha caso tenha digitado acima'
                    : 'Digite a senha novamente'
                }
                className={cn(
                  'text-xs bg-[#F8FAFC]',
                  formErrors.passwordConfirm && 'border-red-500',
                )}
              />
              {formErrors.passwordConfirm && (
                <p className="text-[11px] text-red-600 font-medium">{formErrors.passwordConfirm}</p>
              )}
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
