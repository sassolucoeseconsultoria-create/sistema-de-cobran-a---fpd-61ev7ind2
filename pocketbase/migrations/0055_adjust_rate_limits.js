/// <reference types="pocketbase" />

/**
 * Migration 0055: Ajustar configurações de Rate Limiting do PocketBase.
 *
 * Aumenta a tolerância de requisições por segundo para o backend do PocketBase
 * permitindo que operações legítimas de importação e consolidação não sejam
 * estranguladas com 429 tão agressivamente.
 */
migrate(
  (app) => {
    try {
      const settings = app.settings()
      if (settings && settings.rateLimits) {
        // Desativa ou expande significativamente os limites das regras padrão
        // No PocketBase, se enabled for false, o rate limiter nativo não rejeita com 429
        settings.rateLimits.enabled = false

        // Caso reativado futuramente, ajusta as regras para limites generosos
        settings.rateLimits.rules = [
          { label: '*:auth', audience: '', duration: 3, maxRequests: 20 },
          { label: '*:create', audience: '', duration: 5, maxRequests: 500 },
          { label: '/api/batch', audience: '', duration: 1, maxRequests: 50 },
          { label: '/api/', audience: '', duration: 10, maxRequests: 5000 },
        ]

        app.save(settings)
        console.log('[Migration 0055] Configurações de rateLimits atualizadas com sucesso.')
      }
    } catch (err) {
      console.warn('[Migration 0055] Não foi possível alterar settings.rateLimits:', err)
    }
  },
  (_app) => {
    // safe revert
  },
)
