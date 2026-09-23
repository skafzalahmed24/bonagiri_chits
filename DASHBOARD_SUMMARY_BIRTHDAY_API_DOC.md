# Dashboard Summary API - Birthday List Documentation

## **Endpoint Overview**
- **Endpoint:** `POST /api/dashboard/summary`
- **Method:** `POST`
- **Content-Type:** `application/json`
- **Headers:**
  ```http
  Authorization: Bearer <ACCESS_TOKEN>
  ```
- **Request Body:** `{}` *(Empty JSON)*

---

## **Current Month Birthday List**

The dashboard summary endpoint returns the active company members who celebrate their birthday in the **current month** (`is_deleted_status: 0`), sorted chronologically by day of birth (`1` to `31`).

### **Locations in Response Data**

1. **`data.birthdays`** *(Primary Array)*
   - A list containing all members celebrating their birthday in the current month.
2. **`data.alerts.birthdays_this_month`** *(Alerts Array)*
   - Included inside the `alerts` object alongside other critical notifications.
3. **`data.statistics.birthdays_this_month`** *(Count Integer)*
   - Total count of members celebrating birthdays this month.

---

## **Birthday Member Object Schema**

| Field | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `id` | `Number` | Unique Member ID | `15` |
| `member_id` | `String \| null` | Member Code / ID | `"MEM1001"` |
| `name` | `String` | Full Name of the Member | `"Afzal Ahmed"` |
| `dob` | `String` | Date of Birth (`YYYY-MM-DD`) | `"1995-09-25"` |
| `date_of_birth` | `String` | Date of Birth (`YYYY-MM-DD`) | `"1995-09-25"` |
| `mobile_number` | `String \| null` | Mobile / Phone Number | `"9876543210"` |
| `profile_image` | `String \| null` | Uploaded Profile Photo URL/Path | `"uploads/member_15_photo.jpg"` |

---

## **Full Response Example**

```json
{
  "status": 200,
  "message": "Dashboard data retrieved successfully",
  "data": {
    "financials": {
      "collection_today": 45000,
      "collection_month": 320000,
      "outstanding_dues": 150000,
      "commission_earned": 25000,
      "dividend_distributed": 50000
    },
    "statistics": {
      "total_active_members": 48,
      "active_chit_groups": 8,
      "new_enrollments_this_month": 5,
      "birthdays_this_month": 2,
      "available_group_capacity": 0
    },
    "alerts": {
      "upcoming_auctions": [
        {
          "group_name": "Gold 5L Batch A",
          "auction_date": "2026-09-28"
        }
      ],
      "installments_due_this_week": 12,
      "defaulters_count": 3,
      "birthdays_this_month": [
        {
          "id": 15,
          "member_id": "MEM1001",
          "name": "Afzal Ahmed",
          "dob": "1995-09-25",
          "date_of_birth": "1995-09-25",
          "mobile_number": "9876543210",
          "profile_image": "uploads/member_15_photo.jpg"
        },
        {
          "id": 26,
          "member_id": "MEM229872",
          "name": "Swathipriya",
          "dob": "2000-09-28",
          "date_of_birth": "2000-09-28",
          "mobile_number": "9705688411",
          "profile_image": null
        }
      ]
    },
    "leaderboards": {
      "top_collection_agents": [],
      "top_business_agents": []
    },
    "charts": {
      "monthly_collections": [],
      "group_status": {
        "not_started": 2,
        "running": 6,
        "completed": 10
      }
    },
    "birthdays": [
      {
        "id": 15,
        "member_id": "MEM1001",
        "name": "Afzal Ahmed",
        "dob": "1995-09-25",
        "date_of_birth": "1995-09-25",
        "mobile_number": "9876543210",
        "profile_image": "uploads/member_15_photo.jpg"
      },
      {
        "id": 26,
        "member_id": "MEM229872",
        "name": "Swathipriya",
        "dob": "2000-09-28",
        "date_of_birth": "2000-09-28",
        "mobile_number": "9705688411",
        "profile_image": null
      }
    ]
  }
}
```

---

## **Frontend UI Integration Example (React / Axios)**

```jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';

export const DashboardBirthdayWidget = () => {
  const [birthdays, setBirthdays] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardSummary = async () => {
      try {
        const response = await axios.post('/api/dashboard/summary', {}, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        });

        // Birthday list available in response.data.data.birthdays
        setBirthdays(response.data.data.birthdays || []);
      } catch (error) {
        console.error('Error fetching dashboard summary:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardSummary();
  }, []);

  if (loading) return <div>Loading birthdays...</div>;

  return (
    <div className="birthday-card">
      <h3>🎂 This Month's Birthdays ({birthdays.length})</h3>
      {birthdays.length === 0 ? (
        <p>No birthdays this month.</p>
      ) : (
        <ul className="birthday-list">
          {birthdays.map((member) => (
            <li key={member.id} className="birthday-item">
              <img 
                src={member.profile_image || '/default-avatar.png'} 
                alt={member.name} 
                className="avatar" 
              />
              <div className="info">
                <strong>{member.name}</strong>
                <span>ID: {member.member_id || 'N/A'}</span>
                <span>DOB: {member.dob}</span>
                <span>Phone: {member.mobile_number || 'N/A'}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
```
