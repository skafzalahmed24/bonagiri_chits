# Valid Offers & Banners Management - Frontend API Documentation

## Overview

The **Valid Offers / Banners** module enables admin users to manage promotional and offer banners displayed across the user mobile and web applications. Banners support two distribution types:
1. **Regular (Type `1`)**: Visible to all subscribers/users within the company.
2. **Targeted / Particular People (Type `2`)**: Visible only to specific assigned subscribers selected by the admin using multi-select checkboxes.

---

## 1. Database Schema

### `banners` Table
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INTEGER` (PK, Auto-increment) | Primary Key |
| `company_id` | `UUID` / `STRING` | Company ID associated with the banner |
| `banner_image` | `STRING` | Image URL path (e.g. `/uploads/banner-1234.png`) |
| `banner_type` | `INTEGER` | `1` = Regular (All users), `2` = Particular people (Targeted) |
| `status` | `INTEGER` | `1` = Active, `0` = Inactive (Default: `1`) |
| `is_deleted_status` | `INTEGER` | `0` = Active, `1` = Deleted (Default: `0`) |
| `banner_start_date`| `DATEONLY` | Start date (`YYYY-MM-DD`) |
| `banner_end_date` | `DATEONLY` | End date (`YYYY-MM-DD`) |
| `createdAt` | `TIMESTAMP` | Record creation timestamp |
| `updatedAt` | `TIMESTAMP` | Record update timestamp |

### `assigned_banner_to_peoples` Table
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INTEGER` (PK, Auto-increment) | Primary Key |
| `assigned_banner_id` | `INTEGER` | Foreign Key referencing `banners.id` |
| `subscriber_id` | `INTEGER` | Foreign Key referencing `member.id` |
| `createdAt` | `TIMESTAMP` | Assignment creation timestamp |
| `updatedAt` | `TIMESTAMP` | Assignment update timestamp |

---

## 2. Authentication & Headers

All Admin and User endpoints require Bearer Token authorization:
```http
Authorization: Bearer <YOUR_ACCESS_TOKEN>
```

---

## 3. User / Subscriber API

### 3.1 Get Valid Offers
**Endpoint:** `POST /api/user/valid-offers`  
**Content-Type:** `application/json`  
**Authorization:** `Bearer <SUBSCRIBER_ACCESS_TOKEN>`

Fetches active banners currently valid for the logged-in subscriber based on the current date:
- All Regular banners (`banner_type: 1`).
- Targeted banners (`banner_type: 2`) assigned to this subscriber.

#### Request Body (with Pagination)
```json
{
  "min": 0,
  "max": 10
}
```

#### Success Response (`200 OK`)
```json
{
  "status": 1,
  "message": "Valid offers retrieved successfully",
  "data": {
    "count": 2,
    "rows": [
      {
        "id": 12,
        "banner_image": "/uploads/banner-1726848934.png",
        "banner_type": 2,
        "banner_type_label": "Targeted",
        "banner_start_date": "2026-09-20",
        "banner_end_date": "2026-10-20",
        "status": 1
      },
      {
        "id": 8,
        "banner_image": "/uploads/festival-offer.png",
        "banner_type": 1,
        "banner_type_label": "Regular",
        "banner_start_date": "2026-09-01",
        "banner_end_date": "2026-09-30",
        "status": 1
      }
    ]
  }
}
```

---

## 4. Admin API Endpoints

### 4.1 Create or Update Banner
**Endpoint:** `POST /api/banner/store-or-update`  
**Content-Type:** `multipart/form-data` (when uploading a new image file) or `application/json` (if reusing existing image URL)

#### Request Fields
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `Number` | Optional | Include when updating an existing banner. Omit when creating. |
| `banner_image` | `File` or `String` | Required (on create) | Upload file (multipart key: `banner_image`) or string URL path. |
| `banner_type` | `Number` | Required | `1` for Regular (All subscribers), `2` for Particular people. |
| `banner_start_date`| `String` (`YYYY-MM-DD`) | Required | Offer start date. |
| `banner_end_date` | `String` (`YYYY-MM-DD`) | Required | Offer end date. |
| `status` | `Number` | Optional | `1` for Active, `0` for Inactive (Default: `1`). |
| `subscriber_ids` | `Array<Number>` / `JSON String` / `String` | Required if `banner_type = 2` | Array of member IDs selected via checkboxes (e.g. `[15, 18, 22]`, `"[15, 18, 22]"`, or `"15,18,22"`). |

#### Request Example (JavaScript / FormData for React)
```javascript
const formData = new FormData();
if (editingBannerId) {
  formData.append('id', editingBannerId);
}
if (selectedImageFile) {
  formData.append('banner_image', selectedImageFile);
}
formData.append('banner_type', bannerType); // 1 or 2
formData.append('banner_start_date', '2026-09-20');
formData.append('banner_end_date', '2026-10-20');
formData.append('status', 1);

// When banner_type is 2 (Targeted), pass selected subscriber IDs
if (bannerType === 2) {
  // selectedSubscriberIds is an array like [15, 23, 42]
  formData.append('subscriber_ids', JSON.stringify(selectedSubscriberIds));
}

const response = await axios.post('/api/banner/store-or-update', formData, {
  headers: {
    'Content-Type': 'multipart/form-data',
    'Authorization': `Bearer ${token}`
  }
});
```

#### Success Response (`200 OK` / `201 Created`)
```json
{
  "status": 1,
  "message": "Banner created successfully",
  "data": {
    "id": 12,
    "company_id": "3e5562eb-9d67-4116-aae9-fbf124b72918",
    "banner_image": "/uploads/banner-1726848934.png",
    "banner_type": 2,
    "status": 1,
    "is_deleted_status": 0,
    "banner_start_date": "2026-09-20",
    "banner_end_date": "2026-10-20",
    "createdAt": "2026-09-20T16:15:24.000Z",
    "updatedAt": "2026-09-20T16:15:24.000Z",
    "assigned_subscribers": [
      {
        "id": 1,
        "assigned_banner_id": 12,
        "subscriber_id": 15,
        "subscriber": {
          "id": 15,
          "name": "Ravi Kumar",
          "member_id": "MEM001",
          "mobile_number": "9876543210",
          "upload_image": "/uploads/profile.jpg"
        }
      }
    ]
  }
}
```

---

### 4.2 Get All Banners (List View with Pagination & Filters)
**Endpoint:** `POST /api/banner/get-all`  
**Content-Type:** `application/json`

#### Request Body
```json
{
  "min": 0,
  "max": 10,
  "banner_type": 2,
  "status": 1,
  "from_date": "2026-09-01",
  "to_date": "2026-09-30",
  "search": ""
}
```

#### Success Response (`200 OK`)
```json
{
  "status": 1,
  "message": "Banners retrieved successfully",
  "data": {
    "count": 5,
    "rows": [
      {
        "id": 12,
        "company_id": "3e5562eb-9d67-4116-aae9-fbf124b72918",
        "banner_image": "/uploads/banner-1726848934.png",
        "banner_type": 2,
        "banner_type_label": "Targeted",
        "status": 1,
        "status_label": "Active",
        "banner_start_date": "2026-09-20",
        "banner_end_date": "2026-10-20",
        "assigned_subscribers_count": 3,
        "assigned_subscribers": [
          {
            "id": 15,
            "name": "Ravi Kumar",
            "member_id": "MEM001",
            "mobile_number": "9876543210",
            "upload_image": "/uploads/profile.jpg"
          }
        ],
        "createdAt": "2026-09-20T16:15:24.000Z",
        "updatedAt": "2026-09-20T16:15:24.000Z"
      }
    ]
  }
}
```

---

### 4.3 Get Banner By ID (Edit / Details View)
**Endpoint:** `POST /api/banner/get-by-id`  
**Content-Type:** `application/json`

#### Request Body
```json
{
  "id": 12
}
```

#### Success Response (`200 OK`)
```json
{
  "status": 1,
  "message": "Banner details retrieved successfully",
  "data": {
    "id": 12,
    "company_id": "3e5562eb-9d67-4116-aae9-fbf124b72918",
    "banner_image": "/uploads/banner-1726848934.png",
    "banner_type": 2,
    "banner_type_label": "Targeted",
    "status": 1,
    "status_label": "Active",
    "banner_start_date": "2026-09-20",
    "banner_end_date": "2026-10-20",
    "assigned_subscribers_count": 2,
    "subscriber_ids": [15, 18],
    "assigned_subscribers": [
      {
        "id": 15,
        "name": "Ravi Kumar",
        "member_id": "MEM001",
        "mobile_number": "9876543210",
        "email": "ravi@example.com",
        "upload_image": "/uploads/profile.jpg"
      },
      {
        "id": 18,
        "name": "Suresh Reddy",
        "member_id": "MEM002",
        "mobile_number": "9876543211",
        "email": "suresh@example.com",
        "upload_image": null
      }
    ],
    "createdAt": "2026-09-20T16:15:24.000Z",
    "updatedAt": "2026-09-20T16:15:24.000Z"
  }
}
```

---

### 4.4 Change Banner Status (Toggle Active / Inactive)
**Endpoint:** `POST /api/banner/status`  
**Content-Type:** `application/json`

#### Request Body
```json
{
  "id": 12,
  "status": 0
}
```

#### Success Response (`200 OK`)
```json
{
  "status": 1,
  "message": "Banner status updated to Inactive",
  "data": {
    "id": 12,
    "status": 0
  }
}
```

---

### 4.5 Delete Banner (Soft Delete)
**Endpoint:** `POST /api/banner/delete`  
**Content-Type:** `application/json`

#### Request Body
```json
{
  "id": 12
}
```

#### Success Response (`200 OK`)
```json
{
  "status": 1,
  "message": "Banner deleted successfully"
}
```

---

## 5. React Frontend Implementation Guide

### Multi-Subscriber Checkbox Selector Example
```jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BannerForm = ({ existingBanner, onSaveSuccess }) => {
  const [bannerType, setBannerType] = useState(existingBanner ? existingBanner.banner_type : 1);
  const [startDate, setStartDate] = useState(existingBanner?.banner_start_date || '');
  const [endDate, setEndDate] = useState(existingBanner?.banner_end_date || '');
  const [imageFile, setImageFile] = useState(null);
  const [selectedSubscribers, setSelectedSubscribers] = useState(existingBanner?.subscriber_ids || []);
  const [allSubscribers, setAllSubscribers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch subscribers for targeted selection
  useEffect(() => {
    const fetchSubscribers = async () => {
      try {
        const res = await axios.post('/api/member/get-all', { min: 0, max: 500 });
        setAllSubscribers(res.data?.data?.rows || []);
      } catch (err) {
        console.error('Failed to load subscribers', err);
      }
    };
    fetchSubscribers();
  }, []);

  const handleCheckboxToggle = (subscriberId) => {
    setSelectedSubscribers(prev => 
      prev.includes(subscriberId)
        ? prev.filter(id => id !== subscriberId)
        : [...prev, subscriberId]
    );
  };

  const handleSelectAll = (filteredList) => {
    const allFilteredIds = filteredList.map(s => s.id);
    const isAllSelected = allFilteredIds.every(id => selectedSubscribers.includes(id));
    if (isAllSelected) {
      setSelectedSubscribers(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      setSelectedSubscribers(prev => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData();
      if (existingBanner?.id) {
        formData.append('id', existingBanner.id);
      }
      if (imageFile) {
        formData.append('banner_image', imageFile);
      }
      formData.append('banner_type', bannerType);
      formData.append('banner_start_date', startDate);
      formData.append('banner_end_date', endDate);

      if (bannerType === 2) {
        if (selectedSubscribers.length === 0) {
          alert('Please select at least one subscriber.');
          setLoading(false);
          return;
        }
        formData.append('subscriber_ids', JSON.stringify(selectedSubscribers));
      }

      await axios.post('/api/banner/store-or-update', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      alert('Banner saved successfully!');
      if (onSaveSuccess) onSaveSuccess();
    } catch (error) {
      alert(error.response?.data?.message || 'Error saving banner');
    } finally {
      setLoading(false);
    }
  };

  const filteredSubscribers = allSubscribers.filter(s => 
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.mobile_number?.includes(searchTerm) ||
    s.member_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <form onSubmit={handleSubmit} className="banner-form">
      <h3>{existingBanner ? 'Edit Banner' : 'Create Banner'}</h3>

      {/* Banner Type Radio Buttons */}
      <div className="form-group">
        <label>Banner Type:</label>
        <div>
          <label>
            <input 
              type="radio" 
              name="banner_type" 
              value={1} 
              checked={bannerType === 1} 
              onChange={() => setBannerType(1)} 
            />
            Regular (All Subscribers)
          </label>
          <label style={{ marginLeft: '16px' }}>
            <input 
              type="radio" 
              name="banner_type" 
              value={2} 
              checked={bannerType === 2} 
              onChange={() => setBannerType(2)} 
            />
            Targeted (Particular People)
          </label>
        </div>
      </div>

      {/* Image Upload */}
      <div className="form-group">
        <label>Banner Image:</label>
        <input 
          type="file" 
          accept="image/*" 
          onChange={(e) => setImageFile(e.target.files[0])} 
        />
      </div>

      {/* Date Pickers */}
      <div className="form-row">
        <div className="form-group">
          <label>Start Date:</label>
          <input 
            type="date" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)} 
            required 
          />
        </div>
        <div className="form-group">
          <label>End Date:</label>
          <input 
            type="date" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)} 
            required 
          />
        </div>
      </div>

      {/* Subscriber Selection Box for Type 2 */}
      {bannerType === 2 && (
        <div className="subscriber-selector-box" style={{ border: '1px solid #ddd', padding: '12px', borderRadius: '6px' }}>
          <h4>Select Subscribers ({selectedSubscribers.length} Selected)</h4>
          <input 
            type="text" 
            placeholder="Search by name, member ID or mobile..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', marginBottom: '8px', padding: '6px' }}
          />
          <button 
            type="button" 
            onClick={() => handleSelectAll(filteredSubscribers)}
            style={{ marginBottom: '8px' }}
          >
            Select / Deselect All Filtered
          </button>
          
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {filteredSubscribers.map(sub => (
              <div key={sub.id} style={{ display: 'flex', alignItems: 'center', margin: '4px 0' }}>
                <input 
                  type="checkbox" 
                  id={`sub-${sub.id}`} 
                  checked={selectedSubscribers.includes(sub.id)}
                  onChange={() => handleCheckboxToggle(sub.id)}
                />
                <label htmlFor={`sub-${sub.id}`} style={{ marginLeft: '8px', cursor: 'pointer' }}>
                  <strong>{sub.name}</strong> ({sub.member_id || 'No ID'}) - {sub.mobile_number}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      <button type="submit" disabled={loading} style={{ marginTop: '16px' }}>
        {loading ? 'Saving...' : 'Save Banner'}
      </button>
    </form>
  );
};

export default BannerForm;
```
