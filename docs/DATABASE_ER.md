# Database ER Diagram

## Entity Relationship Diagram

```mermaid
erDiagram
    profiles ||--o| companies : "belongs to"
    profiles }o--|| auth_users : "extends"

    companies ||--o| whatsapp_configs : "has one"
    companies ||--o{ knowledge_base : "has many"
    companies ||--o{ messages : "has many"
    companies ||--o{ tickets : "has many"
    companies ||--o{ staff : "has many"
    companies ||--o| subscriptions : "has one"
    companies ||--o{ activity_logs : "has many"

    staff }o--|| profiles : "linked to"
    tickets }o--o| staff : "assigned to"
    messages }o--o| tickets : "may create"

    subscription_plans ||--o{ subscriptions : "defines"

    profiles {
        uuid id PK
        uuid user_id FK
        uuid company_id FK
        text full_name
        user_role role
        text avatar_url
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    companies {
        uuid id PK
        text company_name
        company_category category
        text phone
        text email
        text address
        jsonb working_hours
        text logo
        subscription_plan_type subscription_plan
        company_status status
        timestamptz created_at
        timestamptz updated_at
    }

    whatsapp_configs {
        uuid id PK
        uuid company_id FK
        text phone_number
        text business_account_id
        text access_token
        text webhook_verify_token
        whatsapp_status status
        timestamptz created_at
        timestamptz updated_at
    }

    knowledge_base {
        uuid id PK
        uuid company_id FK
        text title
        text content
        text category
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    messages {
        uuid id PK
        uuid company_id FK
        text customer_phone
        text customer_name
        text message
        message_sender_type sender_type
        message_status status
        uuid ticket_id FK
        uuid staff_id FK
        text whatsapp_message_id
        timestamptz created_at
    }

    tickets {
        uuid id PK
        uuid company_id FK
        text customer_phone
        text customer_name
        text subject
        ticket_priority priority
        uuid assigned_staff FK
        ticket_status status
        timestamptz created_at
        timestamptz updated_at
        timestamptz closed_at
    }

    staff {
        uuid id PK
        uuid company_id FK
        uuid profile_id FK
        text name
        text email
        staff_role role
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    subscription_plans {
        uuid id PK
        subscription_plan_type plan_type
        text name
        text description
        int message_limit
        int user_limit
        decimal price_monthly
        boolean is_active
        timestamptz created_at
    }

    subscriptions {
        uuid id PK
        uuid company_id FK
        uuid plan_id FK
        int messages_used
        int messages_limit
        int users_limit
        subscription_status status
        timestamptz starts_at
        timestamptz ends_at
        timestamptz created_at
        timestamptz updated_at
    }

    activity_logs {
        uuid id PK
        uuid company_id FK
        uuid user_id FK
        text action
        text entity_type
        uuid entity_id
        jsonb metadata
        text ip_address
        timestamptz created_at
    }
```

---

## Enum Tipleri

| Enum | Değerler |
|------|----------|
| `user_role` | `super_admin`, `company_admin`, `staff` |
| `company_category` | `universite`, `klinik`, `dis_hekimi`, `guzellik_merkezi`, `emlak`, `rent_a_car`, `otel`, `restoran`, `kurs`, `diger` |
| `company_status` | `active`, `inactive`, `suspended`, `trial` |
| `subscription_plan_type` | `starter`, `business`, `enterprise` |
| `subscription_status` | `active`, `expired`, `cancelled`, `trial` |
| `whatsapp_status` | `connected`, `disconnected`, `pending`, `error` |
| `message_sender_type` | `customer`, `ai`, `staff` |
| `message_status` | `open`, `closed`, `transferred` |
| `ticket_priority` | `low`, `medium`, `high`, `urgent` |
| `ticket_status` | `open`, `in_progress`, `resolved`, `closed` |
| `staff_role` | `admin`, `agent`, `supervisor` |

---

## Multi-Tenant İzolasyon Stratejisi

1. Her tenant-scoped tabloda `company_id` foreign key
2. RLS politikaları `auth.uid()` → `profiles.company_id` zinciri ile izolasyon
3. `super_admin` rolü tüm verilere erişebilir (özel RLS policy)
4. Backend middleware ek katman olarak `company_id` doğrular

---

## İndeksler

- `messages(company_id, customer_phone, created_at DESC)` — konuşma listesi
- `tickets(company_id, status, assigned_staff)` — ticket sorguları
- `knowledge_base(company_id, category)` — AI bilgi çekme
- `activity_logs(company_id, created_at DESC)` — log sorguları
- `profiles(user_id)` — auth lookup
- `whatsapp_configs(phone_number)` — webhook şirket eşleme
