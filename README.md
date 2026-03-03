# ShopifyStripeTracking

Sistema de rastreio automático integrado com Shopify + Stripe.

## Instalação
```bash
npm install
cp .env.example .env
# Edite o .env com suas chaves
npm run dev
```

## Deploy (Railway)
1. Suba no GitHub
2. Conecte no railway.app
3. Configure as variáveis de ambiente
4. Deploy automático!

## Webhooks na Shopify
- Criação: POST /webhook/orders/create
- Cancelamento: POST /webhook/orders/cancelled

Veja o README completo nos arquivos gerados.