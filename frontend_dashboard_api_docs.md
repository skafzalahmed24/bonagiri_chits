# Admin Dashboard API - Frontend Documentation

This document outlines how to integrate the Admin Dashboard API.

> [!IMPORTANT]  
> **Security & Scoping Note:** 
> Yes, this API is strictly **Company Based**. The backend automatically extracts the `companyId` from the authenticated user's token and scopes *all* metrics (collections, members, groups, leaderboards) to that specific company. Data from other companies is completely isolated.

---

## Endpoint Details

- **URL:** `/api/admin/dashboard/summary` *(adjust prefix `/api/admin` based on your base URL)*
- **Method:** `POST`
- **Authentication:** Required (Pass the admin/staff Bearer Token in headers)

### Request Headers
```json
{
  "Authorization": "Bearer <YOUR_JWT_TOKEN>"
}
```

### Request Body
An empty JSON body is sufficient for now. 
```json
{}
```

---

## Response Structure

The API returns a consolidated JSON object containing 5 main sections: `financials`, `statistics`, `alerts`, `leaderboards`, and `charts`.

### Success Response (200 OK)

```json
{
  "status": 200,
  "message": "Dashboard data retrieved successfully",
  "data": {
    
    "financials": {
      "collection_today": 12500,        // Total amount collected today
      "collection_month": 450000,       // Total amount collected this month
      "outstanding_dues": 0,            // (Placeholder)
      "commission_earned": 25000,       // Total company commission from auctions
      "dividend_distributed": 12000     // Total dividend distributed to members
    },
    
    "statistics": {
      "total_active_members": 350,      // Total active members in the company
      "active_chit_groups": 12,         // Total running chit groups
      "new_enrollments_this_month": 15, // Enrollments created this month
      "available_group_capacity": 0     // (Placeholder)
    },
    
    "alerts": {
      "upcoming_auctions": [            // Auctions scheduled in the next 7 days
        {
          "group_name": "Gold Chit 5L",
          "auction_date": "2026-07-22"
        }
      ],
      "installments_due_this_week": 45, // Installments with due dates in the next 7 days
      "defaulters_count": 0             // (Placeholder)
    },
    
    "leaderboards": {
      "top_collection_agents": [        // Top 5 agents by collection this month
        {
          "collection_agent_id": 4,
          "collected_amount": 150000
        }
      ],
      "top_business_agents": []         // (Placeholder)
    },
    
    "charts": {
      "monthly_collections": [          // Trailing 6 months collection data for bar charts
        {
          "month": 7,                   // e.g. July
          "year": 2026,
          "amount": 450000
        },
        {
          "month": 6,
          "year": 2026,
          "amount": 320000
        }
      ],
      "group_status": {                 // Data for a pie/donut chart
        "not_started": 0,
        "running": 12,
        "completed": 0
      }
    }
    
  }
}
```

### Error Responses
- **401 Unauthorized:** Missing or invalid JWT token.
- **500 Internal Server Error:** If there is a database issue.
