# Mkononi Connect: backend (runs from the terminal)

Real Africa's Talking (AT) integration: USSD, SMS (+delivery reports), Voice/IVR, Airtime, Mobile Data.
Outage detection, fraud reporting (customer-reported, unverified), support assistant (answers only from DB facts),
JWT roles, Socket.IO live events, analytics, demo mode. UI comes later; a CLI drives everything.

## Quick start
```bash
docker compose up -d                 # PostgreSQL
cd backend && cp ../.env.example .env
#  edit .env: JWT_SECRET (16+ chars), SEED_ADMIN_PASSWORD, AFRICASTALKING_API_KEY (sandbox key; username stays "sandbox")
npm install
npm run setup                        # create tables + super admin
npm run dev                          # server on :4000
```
In a second terminal (from `backend/`):
```bash
npm run cli -- health
npm run cli -- watch                 # live events
npm run cli -- ussd +254712345678    # dial the USSD menu
npm run cli -- demo                  # 5 simulated reports -> possible outage
npm run cli -- incidents
npm run cli -- confirm INC-1001      # confirms + sends real SMS via AT to real (non-demo) reporters
npm run cli -- sms                   # SMS status: PENDING/SENT/DELIVERED/FAILED
npm run cli -- chat                  # ask "Is there a network problem in Kitui?"
npm run cli -- analytics
```
Tip: to see SMS in the sandbox, use the AT simulator phone number for USSD reports (real reporters), not `demo`
(demo incidents intentionally never send SMS). Run `ussd` 5 times from different +254 numbers for the same area and issue.

## Africa's Talking setup
Expose the server (`ngrok http 4000`) and set in the AT sandbox dashboard:
- USSD callback `https://<tunnel>/api/webhooks/africastalking/ussd`
- SMS delivery reports `https://<tunnel>/api/webhooks/africastalking/delivery`
- SMS inbound `.../sms`, Voice `.../voice` (voice needs a Voice number)
Mobile data needs a product created in your AT account (`DATA_PRODUCT_NAME`). Data prices are DEMO values.
Docs: https://developers.africastalking.com

## Roles
`SUPER_ADMIN` (everything), `NETWORK_OPERATOR`, `SUPPORT_AGENT`, `FRAUD_ANALYST`, `CUSTOMER` (own reports only).
Public `/api/auth/register` makes customers; staff come from `npm run seed`.

## Tests
`npm test` runs UNIT tests only (fraud rules, phone validation, USSD flow with mocks). No sandbox integration tests yet.

## Known gaps
No frontend, no map coordinates/radius clustering (grouping is by area name + issue type), no county field,
no incident updates table, no OTP/registration SMS, no USSD airtime/data/support menus, no Docker image for the API.
