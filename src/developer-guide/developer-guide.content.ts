export interface FlowStep {
  method: string;
  path: string;
  title: string;
  curl: string;
  response: string;
  note?: string;
}

export interface Flow {
  id: string;
  category: string;
  title: string;
  description: string;
  prerequisites?: string;
  steps: FlowStep[];
}

const ALL_FLOWS: Flow[] = [
  // ── Getting Started ──────────────────────────────────────────
  {
    id: 'authentication',
    category: 'Getting Started',
    title: 'Authentication',
    description:
      'The ChurchOS API uses Supabase Auth with JWT Bearer tokens. All protected endpoints require a valid token in the Authorization header. This flow covers the complete auth lifecycle: creating an account, logging in, refreshing expired tokens, and logging out.',
    prerequisites: 'None — registration is publicly accessible.',
    steps: [
      {
        method: 'POST',
        path: '/auth/register',
        title: 'Create an account',
        curl: `curl -X POST http://localhost:3001/api/v1/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "pastor@mychurch.org",
    "password": "SecurePass123!",
    "firstName": "John",
    "lastName": "Doe",
    "churchName": "Victory Chapel",
    "role": "senior_pastor"
  }'`,
        response: `{
  "success": true,
  "data": {
    "user": { "id": "uuid", "email": "pastor@mychurch.org" },
    "profile": {
      "id": "uuid",
      "firstName": "John",
      "lastName": "Doe",
      "role": "senior_pastor"
    },
    "church": { "id": "uuid", "name": "Victory Chapel" },
    "session": {
      "access_token": "eyJhbGciOi...",
      "refresh_token": "eyJhbGciOi...",
      "expires_in": 3600
    }
  }
}`,
        note: 'Registration auto-creates a church, an admin profile, and returns a session token. The access_token expires in 1 hour.',
      },
      {
        method: 'POST',
        path: '/auth/login',
        title: 'Log in and get tokens',
        curl: `curl -X POST http://localhost:3001/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "pastor@mychurch.org",
    "password": "SecurePass123!"
  }'`,
        response: `{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "eyJhbGciOi...",
    "expires_in": 3600,
    "user": { "id": "uuid", "email": "pastor@mychurch.org" },
    "profile": {
      "id": "uuid",
      "firstName": "John",
      "lastName": "Doe",
      "role": "senior_pastor",
      "church_id": "uuid"
    }
  }
}`,
      },
      {
        method: '-',
        path: '-',
        title: 'Use the token in all subsequent requests',
        curl: `curl -X GET http://localhost:3001/api/v1/profiles/me \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": { "id": "uuid", "firstName": "John", ... }
}`,
        note: 'Include the Authorization header with Bearer scheme on every authenticated request. The token is verified against Supabase JWKS endpoints.',
      },
      {
        method: 'POST',
        path: '/auth/refresh',
        title: 'Refresh an expired token',
        curl: `curl -X POST http://localhost:3001/api/v1/auth/refresh \\
  -H "Content-Type: application/json" \\
  -d '{
    "refresh_token": "eyJhbGciOi..."
  }'`,
        response: `{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "eyJhbGciOi...",
    "expires_in": 3600
  }
}`,
        note: 'Call this endpoint when the access_token expires (HTTP 401). Store the new refresh_token for future refreshes.',
      },
      {
        method: 'POST',
        path: '/auth/logout',
        title: 'Log out and invalidate the session',
        curl: `curl -X POST http://localhost:3001/api/v1/auth/logout \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "message": "Logged out successfully"
}`,
        note: 'The token is blacklisted in Redis. Subsequent requests with the same token will be rejected.',
      },
    ],
  },

  // ── Core Entities ────────────────────────────────────────────
  {
    id: 'members',
    category: 'Core Entities',
    title: 'Member Onboarding',
    description:
      'The member registry is the heart of the platform. Every person in your church is represented as a Member record with contact info, demographics, status tracking, and optional branch assignment. This flow covers the full member lifecycle.',
    prerequisites: 'An authenticated session with church_admin or secretary role.',
    steps: [
      {
        method: 'POST',
        path: '/members',
        title: 'Create a new member',
        curl: `curl -X POST http://localhost:3001/api/v1/members \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane@example.com",
    "phone": "+2348012345678",
    "gender": "female",
    "dateOfBirth": "1990-05-15",
    "branchId": "branch-uuid",
    "address": "12 Peace Avenue, Lagos"
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "member-uuid",
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane@example.com",
    "phone": "+2348012345678",
    "status": "active",
    "branchId": "branch-uuid",
    "createdAt": "2026-07-22T10:30:00.000Z"
  }
}`,
        note: 'Duplicate phone numbers within the same church are rejected. The member is created with status "active" by default.',
      },
      {
        method: 'GET',
        path: '/members',
        title: 'List members with search and filters',
        curl: `curl -X GET "http://localhost:3001/api/v1/members?page=1&limit=20&status=active&search=jane" \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": [{ "id": "member-uuid", "firstName": "Jane", ... }],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}`,
        note: "Supports search by name/email/phone, filter by status/branch/gender, and sort by any field. All queries are scoped to the authenticated user's church.",
      },
      {
        method: 'GET',
        path: '/members/:memberId',
        title: 'Get a single member with full details',
        curl: `curl -X GET http://localhost:3001/api/v1/members/member-uuid \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": {
    "id": "member-uuid",
    "firstName": "Jane",
    "lastName": "Smith",
    "status": "active",
    "givingHistory": [],
    "attendanceHistory": []
  }
}`,
      },
      {
        method: 'PATCH',
        path: '/members/:memberId',
        title: 'Update member details',
        curl: `curl -X PATCH http://localhost:3001/api/v1/members/member-uuid \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "+2348012345679",
    "status": "inactive"
  }'`,
        response: `{
  "success": true,
  "data": { "id": "member-uuid", "phone": "+2348012345679", "status": "inactive" }
}`,
        note: 'Partial updates only — send only the fields to change. A status change to "inactive" is a soft-delete.',
      },
      {
        method: 'DELETE',
        path: '/members/:memberId',
        title: 'Soft-delete a member',
        curl: `curl -X DELETE http://localhost:3001/api/v1/members/member-uuid \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "message": "Member deleted successfully"
}`,
        note: 'Members are soft-deleted (status → "inactive"). They can be restored via POST /members/:id/restore.',
      },
    ],
  },

  {
    id: 'attendance',
    category: 'Core Entities',
    title: 'Attendance Tracking',
    description:
      'Track service attendance with a two-step flow: first create a Service (e.g., "Sunday Morning Service"), then record attendance against it. Supports individual check-in, bulk import, visitor check-in, and trend analytics.',
    prerequisites: 'Existing members in the system. At least one Service must be created before recording attendance.',
    steps: [
      {
        method: 'POST',
        path: '/services',
        title: 'Create a service',
        curl: `curl -X POST http://localhost:3001/api/v1/services \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Sunday Morning Service",
    "dayOfWeek": "Sunday",
    "startTime": "09:00",
    "endTime": "11:00",
    "branchId": "branch-uuid"
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "service-uuid",
    "name": "Sunday Morning Service",
    "dayOfWeek": "Sunday",
    "startTime": "09:00",
    "endTime": "11:00",
    "isActive": true
  }
}`,
        note: 'Services are reusable templates. You create one Service (e.g., "Sunday Service") and record attendance against it week after week.',
      },
      {
        method: 'POST',
        path: '/attendance',
        title: 'Record a single check-in',
        curl: `curl -X POST http://localhost:3001/api/v1/attendance \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "serviceId": "service-uuid",
    "memberId": "member-uuid"
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "attendance-uuid",
    "serviceId": "service-uuid",
    "memberId": "member-uuid",
    "checkedInAt": "2026-07-22T09:05:00.000Z"
  }
}`,
        note: 'Duplicate check-ins for the same member in the same service are rejected via a unique constraint on [service_id, member_id].',
      },
      {
        method: 'POST',
        path: '/attendance/bulk',
        title: 'Record bulk check-ins',
        curl: `curl -X POST http://localhost:3001/api/v1/attendance/bulk \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "serviceId": "service-uuid",
    "memberIds": ["member-uuid-1", "member-uuid-2", "member-uuid-3"]
  }'`,
        response: `{
  "success": true,
  "data": { "count": 3, "duplicates": 0 }
}`,
        note: 'Duplicate memberIds within the same service are silently skipped. Returns a count of successfully recorded entries.',
      },
      {
        method: 'GET',
        path: '/attendance/summary',
        title: 'Get attendance summary',
        curl: `curl -X GET "http://localhost:3001/api/v1/attendance/summary?startDate=2026-07-01&endDate=2026-07-31" \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": {
    "totalCheckIns": 450,
    "uniqueMembers": 180,
    "averagePerService": 90,
    "byService": [
      { "serviceName": "Sunday Morning", "count": 120 },
      { "serviceName": "Wednesday Bible Study", "count": 65 }
    ]
  }
}`,
      },
    ],
  },

  {
    id: 'branches',
    category: 'Core Entities',
    title: 'Church & Branch Management',
    description:
      'Multi-campus churches can create multiple Branches under one Church account. Each branch has its own services, attendance, events, and optionally its own staff. One branch is designated as the headquarters.',
    prerequisites: 'An authenticated session with church_admin role.',
    steps: [
      {
        method: 'GET',
        path: '/church',
        title: 'Get church profile',
        curl: `curl -X GET http://localhost:3001/api/v1/church \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": {
    "id": "church-uuid",
    "name": "Victory Chapel",
    "denomination": "Pentecostal",
    "address": "123 Worship Street, Lagos",
    "phone": "+2348012345000",
    "email": "info@victorychapel.org"
  }
}`,
      },
      {
        method: 'POST',
        path: '/branches',
        title: 'Create a branch',
        curl: `curl -X POST http://localhost:3001/api/v1/branches \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Lagos Main Campus",
    "address": "42 Freedom Way, Lagos",
    "phone": "+2348012345678",
    "isHeadquarters": true
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "branch-uuid",
    "name": "Lagos Main Campus",
    "isHeadquarters": true
  }
}`,
        note: 'Only one branch per church can be marked as headquarters. The first branch is auto-set as headquarters.',
      },
      {
        method: 'GET',
        path: '/branches',
        title: 'List branches',
        curl: `curl -X GET http://localhost:3001/api/v1/branches \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": [
    { "id": "branch-uuid", "name": "Lagos Main Campus", "isHeadquarters": true, "memberCount": 150 },
    { "id": "branch-uuid-2", "name": "Abuja Campus", "isHeadquarters": false, "memberCount": 80 }
  ]
}`,
      },
      {
        method: 'DELETE',
        path: '/branches/:branchId',
        title: 'Delete a branch',
        curl: `curl -X DELETE http://localhost:3001/api/v1/branches/branch-uuid \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "message": "Branch deleted successfully"
}`,
        note: 'Deletion is blocked if members are still assigned to the branch. Reassign or delete members first.',
      },
    ],
  },

  // ── Giving & Finance ─────────────────────────────────────────
  {
    id: 'digital-giving',
    category: 'Giving & Finance',
    title: 'Digital Giving (Paystack / Flutterwave)',
    description:
      'Accept digital payments through Paystack or Flutterwave. The flow is: initialize a payment → redirect the member to the gateway → handle the webhook callback → allow PDF receipt download. The default gateway is configured per-church.',
    prerequisites: 'Configured PAYSTACK_SECRET_KEY or FLUTTERWAVE_SECRET_KEY in environment. Existing giving categories.',
    steps: [
      {
        method: 'GET',
        path: '/giving/categories',
        title: 'List giving categories',
        curl: `curl -X GET http://localhost:3001/api/v1/giving/categories \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": [
    { "id": "cat-uuid", "name": "Tithe", "isActive": true },
    { "id": "cat-uuid-2", "name": "Offering", "isActive": true },
    { "id": "cat-uuid-3", "name": "Building Project", "isActive": true }
  ]
}`,
        note: 'Categories are configured by church_admin. At least one category must exist before taking payments.',
      },
      {
        method: 'POST',
        path: '/giving/categories',
        title: 'Create a giving category',
        curl: `curl -X POST http://localhost:3001/api/v1/giving/categories \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Missions Fund",
    "description": "Support for missionary work"
  }'`,
        response: `{
  "success": true,
  "data": { "id": "cat-uuid", "name": "Missions Fund", "isActive": true }
}`,
      },
      {
        method: 'POST',
        path: '/giving/initialize',
        title: 'Initialize a payment',
        curl: `curl -X POST http://localhost:3001/api/v1/giving/initialize \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "categoryId": "cat-uuid",
    "amount": 50000,
    "currency": "NGN",
    "gateway": "paystack",
    "memberId": "member-uuid"
  }'`,
        response: `{
  "success": true,
  "data": {
    "authorizationUrl": "https://checkout.paystack.com/abc123",
    "reference": "CHURCHOS-1712345678",
    "accessCode": "abc123",
    "transactionId": "txn-uuid"
  }
}`,
        note: 'The amount is in the smallest currency unit (kobo for NGN). Redirect the member to the authorizationUrl. The transaction is created in "pending" status.',
      },
      {
        method: 'POST',
        path: '/giving/webhook/paystack',
        title: 'Paystack webhook (server-side)',
        curl: `# This is called by Paystack, not by the frontend.
# Paystack sends a POST to this endpoint with the x-paystack-signature header.
# The server verifies the HMAC-SHA512 signature before processing.`,
        response: `{
  "success": true,
  "message": "Webhook processed"
}`,
        note: 'The webhook updates the transaction to "completed". The frontend should poll GET /giving/verify/:reference after redirect to check the status.',
      },
      {
        method: 'GET',
        path: '/giving/verify/:reference',
        title: 'Verify payment after redirect',
        curl: `curl -X GET http://localhost:3001/api/v1/giving/verify/CHURCHOS-1712345678 \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": {
    "status": "completed",
    "amount": 50000,
    "currency": "NGN",
    "gateway": "paystack",
    "categoryName": "Tithe",
    "paidAt": "2026-07-22T11:00:00.000Z"
  }
}`,
      },
      {
        method: 'GET',
        path: '/giving/transactions/:transactionId/receipt',
        title: 'Download PDF receipt',
        curl: `curl -X GET http://localhost:3001/api/v1/giving/transactions/txn-uuid/receipt \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -o receipt.pdf`,
        response: `# Binary PDF file. Save to disk with -o flag.
# The receipt includes: church name, member name, amount, category,
# transaction reference, payment date, and gateway.`,
        note: 'PDF receipts are only available for "completed" transactions. Receipt numbers follow the format YEAR/PREFIX/SEQUENTIAL (e.g., 2026/TIT/0001).',
      },
    ],
  },

  {
    id: 'cash-giving',
    category: 'Giving & Finance',
    title: 'Cash / Bank Transfer Giving',
    description:
      'Record offline giving (cash, bank transfers, or other non-digital payments) directly into the system. This is typically done by church administrators, secretaries, or treasurers.',
    prerequisites: 'Existing giving categories. User must have treasurer, secretary, or church_admin role.',
    steps: [
      {
        method: 'POST',
        path: '/giving/cash',
        title: 'Record a cash/transfer giving',
        curl: `curl -X POST http://localhost:3001/api/v1/giving/cash \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "categoryId": "cat-uuid",
    "amount": 25000,
    "currency": "NGN",
    "memberId": "member-uuid",
    "paymentMethod": "cash",
    "notes": "Sunday service offering"
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "txn-uuid",
    "amount": 25000,
    "paymentMethod": "cash",
    "status": "completed",
    "receiptNumber": "2026/OFF/0042"
  }
}`,
        note: 'Cash giving is immediately marked as "completed". A receipt number is auto-generated. The receipt PDF is available via the same /giving/transactions/:id/receipt endpoint.',
      },
      {
        method: 'GET',
        path: '/giving/transactions',
        title: 'List all transactions',
        curl: `curl -X GET "http://localhost:3001/api/v1/giving/transactions?page=1&limit=20&categoryId=cat-uuid" \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": [
    {
      "id": "txn-uuid",
      "amount": 25000,
      "paymentMethod": "cash",
      "status": "completed",
      "categoryName": "Offering",
      "memberName": "Jane Smith",
      "createdAt": "2026-07-22T12:00:00.000Z"
    }
  ],
  "meta": { "total": 42, "page": 1, "limit": 20, "totalPages": 3 }
}`,
        note: 'Supports filters by category, member, status, payment method, date range, and gateway.',
      },
    ],
  },

  {
    id: 'recurring-giving',
    category: 'Giving & Finance',
    title: 'Recurring Giving (Automated Charges)',
    description:
      'Allow members to set up recurring giving plans (weekly, monthly, quarterly). The system automatically charges their saved payment method on the next_charge_date via Paystack charge_authorization.',
    prerequisites: 'The member must have completed at least one digital payment to save their authorization code.',
    steps: [
      {
        method: 'POST',
        path: '/giving/recurring',
        title: 'Create a recurring giving plan',
        curl: `curl -X POST http://localhost:3001/api/v1/giving/recurring \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "categoryId": "cat-uuid",
    "amount": 10000,
    "currency": "NGN",
    "frequency": "monthly",
    "memberId": "member-uuid"
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "recurring-uuid",
    "amount": 10000,
    "frequency": "monthly",
    "nextChargeDate": "2026-08-22T00:00:00.000Z",
    "isActive": true
  }
}`,
        note: "A Paystack authorization_code is automatically captured from the member's most recent successful transaction. The next_charge_date is calculated based on frequency.",
      },
      {
        method: 'GET',
        path: '/giving/recurring',
        title: 'List recurring plans',
        curl: `curl -X GET http://localhost:3001/api/v1/giving/recurring \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": [{
    "id": "recurring-uuid",
    "amount": 10000,
    "frequency": "monthly",
    "isActive": true,
    "nextChargeDate": "2026-08-22T00:00:00.000Z",
    "lastChargeDate": null
  }]
}`,
      },
      {
        method: 'PATCH',
        path: '/giving/recurring/:id/cancel',
        title: 'Cancel a recurring plan',
        curl: `curl -X PATCH http://localhost:3001/api/v1/giving/recurring/recurring-uuid/cancel \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "message": "Recurring giving cancelled"
}`,
        note: 'Cancellation sets is_active to false. No further charges are attempted. The plan is not deleted — it remains as a record.',
      },
    ],
  },

  {
    id: 'reports',
    category: 'Giving & Finance',
    title: 'Report Generation',
    description:
      'Generate financial, attendance, and member reports with date-range filtering. Reports aggregate data across the entire church. CSV export is available for offline analysis.',
    prerequisites: 'Sufficient data in the system (transactions, attendance records, members).',
    steps: [
      {
        method: 'GET',
        path: '/reports/financial',
        title: 'Get financial report',
        curl: `curl -X GET "http://localhost:3001/api/v1/reports/financial?startDate=2026-01-01&endDate=2026-07-22" \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": {
    "totalGiving": 2500000,
    "averagePerTransaction": 12500,
    "byCategory": [
      { "category": "Tithe", "total": 1500000, "count": 60 },
      { "category": "Offering", "total": 600000, "count": 120 },
      { "category": "Building Project", "total": 400000, "count": 8 }
    ],
    "monthlyTrends": [
      { "month": "2026-01", "total": 350000 },
      { "month": "2026-02", "total": 420000 }
    ]
  }
}`,
      },
      {
        method: 'GET',
        path: '/reports/attendance',
        title: 'Get attendance report',
        curl: `curl -X GET "http://localhost:3001/api/v1/reports/attendance?startDate=2026-01-01&endDate=2026-07-22" \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": {
    "totalAttendance": 5400,
    "averagePerService": 120,
    "byService": [
      { "serviceName": "Sunday Morning", "total": 3200, "average": 145 },
      { "serviceName": "Wednesday Bible Study", "total": 2200, "average": 85 }
    ],
    "monthlyTrends": [
      { "month": "2026-01", "total": 780 },
      { "month": "2026-02", "total": 810 }
    ]
  }
}`,
      },
      {
        method: 'POST',
        path: '/reports/export',
        title: 'Export report as CSV',
        curl: `curl -X POST http://localhost:3001/api/v1/reports/export \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "reportType": "financial",
    "startDate": "2026-01-01",
    "endDate": "2026-07-22",
    "format": "csv"
  }'`,
        response: `# Returns a CSV file download with Content-Type: text/csv
category,amount,count,percentage
Tithe,1500000,60,60.0
Offering,600000,120,24.0
Building Project,400000,8,16.0`,
      },
    ],
  },

  // ── Events & Sermons ─────────────────────────────────────────
  {
    id: 'free-events',
    category: 'Events & Sermons',
    title: 'Free Event Management',
    description:
      'Create and manage free events with registration tracking. Members can register and cancel their registration. Capacity limits are enforced to prevent over-registration.',
    prerequisites: 'An authenticated session. Existing members to register.',
    steps: [
      {
        method: 'POST',
        path: '/events',
        title: 'Create an event',
        curl: `curl -X POST http://localhost:3001/api/v1/events \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Youth Conference 2026",
    "description": "Annual youth gathering",
    "type": "conference",
    "startDate": "2026-08-15T09:00:00.000Z",
    "endDate": "2026-08-17T17:00:00.000Z",
    "location": "Victory Chapel Main Auditorium",
    "capacity": 500,
    "branchId": "branch-uuid"
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "event-uuid",
    "title": "Youth Conference 2026",
    "capacity": 500,
    "registeredCount": 0,
    "isFree": true
  }
}`,
        note: 'Events without ticket tiers are "free" events. The capacity field limits total registrations.',
      },
      {
        method: 'POST',
        path: '/events/:eventId/register',
        title: 'Register a member',
        curl: `curl -X POST http://localhost:3001/api/v1/events/event-uuid/register \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{ "memberId": "member-uuid" }'`,
        response: `{
  "success": true,
  "data": {
    "id": "registration-uuid",
    "status": "confirmed"
  }
}`,
        note: 'Duplicate registration for the same member is rejected. If the event is at capacity (registeredCount >= capacity), registration is blocked.',
      },
      {
        method: 'DELETE',
        path: '/events/:eventId/register/:memberId',
        title: 'Cancel a registration',
        curl: `curl -X DELETE http://localhost:3001/api/v1/events/event-uuid/register/member-uuid \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "message": "Registration cancelled"
}`,
      },
    ],
  },

  {
    id: 'paid-events',
    category: 'Events & Sermons',
    title: 'Paid Event with Ticket Tiers',
    description:
      'Create paid events with multiple ticket tiers (e.g., Regular, VIP, Table). Members pay during registration via Paystack. Ticket validation is available for at-door check-in.',
    prerequisites: 'Configured PAYSTACK_SECRET_KEY. Existing giving categories for ticket payments.',
    steps: [
      {
        method: 'POST',
        path: '/events',
        title: 'Create the event',
        curl: `curl -X POST http://localhost:3001/api/v1/events \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Leadership Summit 2026",
    "description": "Annual leadership training",
    "type": "conference",
    "startDate": "2026-09-10T08:00:00.000Z",
    "endDate": "2026-09-10T17:00:00.000Z",
    "location": "Victory Chapel Main Hall",
    "capacity": 200
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "event-uuid",
    "title": "Leadership Summit 2026",
    "isFree": false,
    "capacity": 200
  }
}`,
      },
      {
        method: 'POST',
        path: '/events/:eventId/tiers',
        title: 'Create ticket tiers',
        curl: `curl -X POST http://localhost:3001/api/v1/events/event-uuid/tiers \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "VIP",
    "price": 25000,
    "currency": "NGN",
    "quantity": 50,
    "description": "VIP seating with refreshments"
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "tier-uuid",
    "name": "VIP",
    "price": 25000,
    "available": 50
  }
}`,
        note: 'Multiple tiers can be created per event. Each tier has its own price and quantity. The total event capacity is shared across tiers.',
      },
      {
        method: 'POST',
        path: '/events/:eventId/register',
        title: 'Register with tier selection',
        curl: `curl -X POST http://localhost:3001/api/v1/events/event-uuid/register \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "memberId": "member-uuid",
    "tierId": "tier-uuid"
  }'`,
        response: `{
  "success": true,
  "data": {
    "registrationId": "reg-uuid",
    "status": "pending_payment",
    "authorizationUrl": "https://checkout.paystack.com/xyz789",
    "reference": "CHURCHOS-EVT-1712345678"
  }
}`,
        note: 'For paid events, registration creates a "pending_payment" status. The member is redirected to the payment gateway. The registration confirms after successful payment.',
      },
      {
        method: 'POST',
        path: '/events/:eventId/webhook/paystack',
        title: 'Payment webhook (server-side)',
        curl: `# Called by Paystack when payment is completed.
# Automatically marks the registration as "confirmed"
# and creates a digital ticket with a unique validation code.`,
        response: `{
  "success": true,
  "message": "Payment confirmed"
}`,
        note: 'After successful payment, the registration status changes to "confirmed" and a ticket with a unique code is generated. The frontend can poll the event details to see the updated status.',
      },
      {
        method: 'POST',
        path: '/events/:eventId/tickets/validate',
        title: 'Validate a ticket at the door',
        curl: `curl -X POST http://localhost:3001/api/v1/events/event-uuid/tickets/validate \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{ "ticketCode": "TKT-ABC123" }'`,
        response: `{
  "success": true,
  "data": {
    "valid": true,
    "memberName": "Jane Smith",
    "tierName": "VIP",
    "checkedIn": true
  }
}`,
        note: 'Each paid ticket has a unique validation code. Validate at the door to prevent duplicate entries. The first validation marks the ticket as used.',
      },
    ],
  },

  {
    id: 'sermons',
    category: 'Events & Sermons',
    title: 'Sermons & Bookmarks',
    description:
      'Manage the sermon archive with search capabilities. Members can bookmark sermons for later reference. Audio URLs are managed after upload to Supabase Storage.',
    prerequisites: 'An authenticated session. Media upload capability (for audio files).',
    steps: [
      {
        method: 'POST',
        path: '/sermons',
        title: 'Create a sermon record',
        curl: `curl -X POST http://localhost:3001/api/v1/sermons \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Walking in Faith",
    "speaker": "Pastor John Doe",
    "series": "Faith Foundations",
    "date": "2026-07-20",
    "tags": ["faith", "foundations"],
    "description": "A message about trusting God in difficult times"
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "sermon-uuid",
    "title": "Walking in Faith",
    "speaker": "Pastor John Doe",
    "series": "Faith Foundations",
    "date": "2026-07-20T00:00:00.000Z"
  }
}`,
      },
      {
        method: 'GET',
        path: '/sermons',
        title: 'Search and list sermons',
        curl: `curl -X GET "http://localhost:3001/api/v1/sermons?search=faith&speaker=Pastor+John&series=Faith+Foundations&page=1&limit=20" \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": [
    {
      "id": "sermon-uuid",
      "title": "Walking in Faith",
      "speaker": "Pastor John Doe",
      "date": "2026-07-20T00:00:00.000Z",
      "tags": ["faith", "foundations"],
      "audioUrl": null
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}`,
        note: 'Supports search by title/speaker, filter by series/tags, and date-range filtering.',
      },
      {
        method: 'POST',
        path: '/sermons/:sermonId/bookmark',
        title: 'Bookmark a sermon',
        curl: `curl -X POST http://localhost:3001/api/v1/sermons/sermon-uuid/bookmark \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "message": "Sermon bookmarked"
}`,
        note: 'A member can bookmark a sermon only once. Duplicate bookmark requests are rejected.',
      },
      {
        method: 'GET',
        path: '/sermons/bookmarks/me',
        title: 'List my bookmarks',
        curl: `curl -X GET http://localhost:3001/api/v1/sermons/bookmarks/me \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": [{ "sermonId": "sermon-uuid", "title": "Walking in Faith", "bookmarkedAt": "2026-07-22T14:00:00.000Z" }]
}`,
      },
      {
        method: 'DELETE',
        path: '/sermons/:sermonId/bookmark',
        title: 'Remove a bookmark',
        curl: `curl -X DELETE http://localhost:3001/api/v1/sermons/sermon-uuid/bookmark \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "message": "Bookmark removed"
}`,
      },
    ],
  },

  // ── Communication ────────────────────────────────────────────
  {
    id: 'whatsapp',
    category: 'Communication',
    title: 'WhatsApp Integration',
    description:
      'Integrated with 360dialog for WhatsApp Business API. Handles webhook verification, inbound message processing with command routing (6 commands), outbound messaging, and template message sending.',
    prerequisites: 'Configured 360DIALOG_API_KEY and WHatsApp phone number ID in environment.',
    steps: [
      {
        method: 'GET',
        path: '/whatsapp/webhook',
        title: 'Webhook verification (360dialog setup)',
        curl: `# This is called by 360dialog during webhook setup.
# 360dialog sends a GET request with challenge parameters.
# The endpoint validates and returns the challenge token.`,
        response: `# Returns the challenge token text (not JSON)
abc123challengetoken`,
        note: 'This is a GET endpoint called by 360dialog during initial webhook configuration. You configure your 360dashboard to point to this URL.',
      },
      {
        method: 'POST',
        path: '/whatsapp/webhook',
        title: 'Inbound message processing',
        curl: `# Called by 360dialog when a member sends a message to your WhatsApp number.
# The system automatically processes the message and routes it:
# HELP → lists available commands
# CHECKIN → checks in for today's service
# GIVE → returns giving link
# PRAYER → logs prayer request
# EVENTS → lists upcoming events
# STATUS → shows 30-day attendance and giving summary`,
        response: `{
  "success": true,
  "message": "Webhook processed"
}`,
        note: 'Inbound messages are automatically routed to command handlers. If no command is recognized, a default help message is sent back.',
      },
      {
        method: 'POST',
        path: '/whatsapp/send',
        title: 'Send an outbound message',
        curl: `curl -X POST http://localhost:3001/api/v1/whatsapp/send \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+2348012345678",
    "message": "Hello! God bless you. Join us this Sunday at 9 AM."
  }'`,
        response: `{
  "success": true,
  "data": {
    "messageId": "msg-uuid",
    "status": "queued"
  }
}`,
        note: 'Outbound messages are queued via BullMQ and delivered asynchronously. The message is logged in the Message table with direction "outbound".',
      },
      {
        method: 'POST',
        path: '/whatsapp/send-template',
        title: 'Send a template message',
        curl: `curl -X POST http://localhost:3001/api/v1/whatsapp/send-template \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+2348012345678",
    "templateName": "service_reminder",
    "parameters": {
      "1": "John",
      "2": "Sunday",
      "3": "9:00 AM"
    }
  }'`,
        response: `{
  "success": true,
  "data": {
    "messageId": "msg-uuid",
    "status": "queued"
  }
}`,
        note: 'Template messages must be approved by WhatsApp and use registered HSM templates. Variables are interpolated using the parameters map.',
      },
    ],
  },

  {
    id: 'broadcasts',
    category: 'Communication',
    title: 'Broadcast Campaign',
    description:
      'Create targeted broadcast campaigns to specific audience segments. Messages are dispatched via channel-specific BullMQ queues (WhatsApp, SMS, Email). Audience filtering supports status, branch, gender, and search criteria.',
    prerequisites: 'Existing message templates. Configured WhatsApp/SMS/Email providers.',
    steps: [
      {
        method: 'POST',
        path: '/templates',
        title: 'Create a message template',
        curl: `curl -X POST http://localhost:3001/api/v1/templates \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Service Reminder",
    "channel": "whatsapp",
    "content": "Hi {{name}}, don\\'t forget our service this {{day}} at {{time}}. God bless you!",
    "category": "marketing",
    "variables": ["name", "day", "time"]
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "template-uuid",
    "name": "Service Reminder",
    "channel": "whatsapp",
    "status": "draft"
  }
}`,
        note: 'Templates have a status workflow: draft → published → archived. Only "published" templates can be used in broadcasts.',
      },
      {
        method: 'POST',
        path: '/broadcasts',
        title: 'Create a broadcast campaign',
        curl: `curl -X POST http://localhost:3001/api/v1/broadcasts \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Sunday Service Reminder",
    "templateId": "template-uuid",
    "channel": "whatsapp",
    "audienceFilter": {
      "status": ["active"],
      "branchId": "branch-uuid",
      "gender": "all"
    },
    "scheduledAt": "2026-07-25T08:00:00.000Z"
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "broadcast-uuid",
    "title": "Sunday Service Reminder",
    "status": "scheduled",
    "estimatedRecipients": 150
  }
}`,
        note: 'The broadcast is created in "scheduled" status. At the scheduled time, messages are enqueued to the appropriate channel queue. You can cancel a broadcast before it starts.',
      },
      {
        method: 'GET',
        path: '/broadcasts/:broadcastId',
        title: 'Track broadcast status',
        curl: `curl -X GET http://localhost:3001/api/v1/broadcasts/broadcast-uuid \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": {
    "id": "broadcast-uuid",
    "status": "in_progress",
    "totalRecipients": 150,
    "sentCount": 98,
    "failedCount": 2,
    "progress": 65
  }
}`,
      },
    ],
  },

  // ── Pastoral & Admin ─────────────────────────────────────────
  {
    id: 'cell-groups',
    category: 'Pastoral & Admin',
    title: 'Cell Group Management',
    description:
      'Cell groups are small fellowship groups that meet in members\' homes. They can be organized under Departments, have assigned leaders and assistants, track attendance, and provide geolocation-based recommendations using the Haversine formula.',
    prerequisites: 'An authenticated session with church_admin or senior_pastor role.',
    steps: [
      {
        method: 'POST',
        path: '/admin/departments',
        title: 'Create a department (optional grouping)',
        curl: `curl -X POST http://localhost:3001/api/v1/admin/departments \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Discipleship",
    "description": "Discipleship and small groups department",
    "headMemberId": "member-uuid"
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "dept-uuid",
    "name": "Discipleship",
    "memberCount": 0
  }
}`,
        note: 'Departments are optional containers for cell groups. You can create cell groups without a department.',
      },
      {
        method: 'POST',
        path: '/admin/cell-groups',
        title: 'Create a cell group',
        curl: `curl -X POST http://localhost:3001/api/v1/admin/cell-groups \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Lagos Island Fellowship",
    "departmentId": "dept-uuid",
    "meetingDay": "Wednesday",
    "meetingTime": "17:00",
    "location": "12 Peace Avenue, Lagos",
    "latitude": 6.5244,
    "longitude": 3.3792,
    "description": "Mid-week fellowship on Lagos Island"
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "cell-uuid",
    "name": "Lagos Island Fellowship",
    "memberCount": 0,
    "meetingDay": "Wednesday"
  }
}`,
        note: 'Latitude and longitude enable the nearest-group recommendation feature using the Haversine formula.',
      },
      {
        method: 'POST',
        path: '/admin/cell-groups/:id/members',
        title: 'Add members to a cell group',
        curl: `curl -X POST http://localhost:3001/api/v1/admin/cell-groups/cell-uuid/members \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "memberId": "member-uuid",
    "role": "member"
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "cell-member-uuid",
    "memberId": "member-uuid",
    "role": "member"
  }
}`,
        note: 'Roles available: member (default), leader, assistant. A member can only belong to one cell group (unique constraint on member_id).',
      },
      {
        method: 'POST',
        path: '/admin/cell-groups/:id/attendance',
        title: 'Record cell group attendance',
        curl: `curl -X POST http://localhost:3001/api/v1/admin/cell-groups/cell-uuid/attendance \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "memberId": "member-uuid",
    "status": "present",
    "meetingDate": "2026-07-22"
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "cell-attendance-uuid",
    "status": "present"
  }
}`,
        note: 'Status options: present, absent, excused. Unique constraint on [cell_group_id, member_id, meeting_date] prevents duplicate records.',
      },
      {
        method: 'GET',
        path: '/admin/cell-groups/nearest',
        title: 'Find nearest cell group',
        curl: `curl -X GET "http://localhost:3001/api/v1/admin/cell-groups/nearest?lat=6.5000&lng=3.3500" \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": [
    { "name": "Lagos Island Fellowship", "distance": 3.2, "meetingDay": "Wednesday", "memberCount": 12 },
    { "name": "Ikeja Connection Group", "distance": 8.1, "meetingDay": "Tuesday", "memberCount": 8 }
  ]
}`,
        note: 'Uses the Haversine formula to calculate great-circle distances. Results are sorted by proximity.',
      },
    ],
  },

  {
    id: 'pastoral-care',
    category: 'Pastoral & Admin',
    title: 'Pastoral Care & Scoring',
    description:
      'Comprehensive pastoral care module with AES-256-GCM encrypted notes, life event tracking, engagement scoring, and risk scoring. Confidentiality levels (standard/confidential/restricted) control access to sensitive notes.',
    prerequisites: 'An authenticated session. PASTORAL_ENCRYPTION_KEY configured in environment.',
    steps: [
      {
        method: 'POST',
        path: '/pastoral/notes',
        title: 'Create a pastoral note',
        curl: `curl -X POST http://localhost:3001/api/v1/pastoral/notes \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "memberId": "member-uuid",
    "content": "Member shared about job loss. Prayed together and scheduled follow-up for next week.",
    "type": "counseling",
    "confidentiality": "standard"
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "note-uuid",
    "memberId": "member-uuid",
    "type": "counseling",
    "confidentiality": "standard",
    "createdAt": "2026-07-22T15:00:00.000Z"
  }
}`,
        note: 'Note content is encrypted at rest using AES-256-GCM. Confidentiality levels: standard (visible to all pastoral staff), confidential (visible to senior pastors+), restricted (requires dual-authorization to delete).',
      },
      {
        method: 'POST',
        path: '/pastoral/life-events',
        title: 'Track a life event',
        curl: `curl -X POST http://localhost:3001/api/v1/pastoral/life-events \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "memberId": "member-uuid",
    "type": "birthday",
    "title": "Jane Smith's Birthday",
    "eventDate": "2026-08-15"
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "life-event-uuid",
    "type": "birthday",
    "eventDate": "2026-08-15T00:00:00.000Z"
  }
}`,
        note: 'Life event types: birthday, wedding, death, dedication, baptism, anniversary. The system can auto-generate greeting messages for upcoming events.',
      },
      {
        method: 'GET',
        path: '/pastoral/engagement',
        title: 'Get engagement scores',
        curl: `curl -X GET "http://localhost:3001/api/v1/pastoral/engagement?memberId=member-uuid" \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": {
    "memberId": "member-uuid",
    "overallScore": 72,
    "components": {
      "attendance": 85,
      "giving": 60,
      "events": 70,
      "communication": 75,
      "consistency": 65
    },
    "level": "engaged"
  }
}`,
        note: 'Scores range from 0-100. Levels: low (0-33), moderate (34-66), engaged (67-100). Scores are recalculated nightly by the NightlyJobsProcessor.',
      },
      {
        method: 'GET',
        path: '/admin/dashboard',
        title: 'Pastoral dashboard',
        curl: `curl -X GET http://localhost:3001/api/v1/admin/dashboard \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": {
    "membersNeedingAttention": 12,
    "highRiskCount": 5,
    "engagementDistribution": {
      "engaged": 120,
      "moderate": 200,
      "low": 45
    },
    "risingStars": [
      { "memberId": "member-uuid", "name": "Jane Smith", "scoreChange": "+15" }
    ]
  }
}`,
        note: 'Dashboard provides a quick overview of member engagement health. Members with declining engagement or high risk scores appear in "needing attention".',
      },
    ],
  },

  {
    id: 'assets',
    category: 'Pastoral & Admin',
    title: 'Asset & Inventory Management',
    description:
      'Comprehensive asset management with categories, maintenance scheduling, depreciation tracking, loan management, QR code generation, and field audit scanning.',
    prerequisites: 'An authenticated session with appropriate role permissions.',
    steps: [
      {
        method: 'POST',
        path: '/assets/categories',
        title: 'Create an asset category',
        curl: `curl -X POST http://localhost:3001/api/v1/assets/categories \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Audio Equipment",
    "description": "Sound systems, microphones, speakers"
  }'`,
        response: `{
  "success": true,
  "data": { "id": "cat-uuid", "name": "Audio Equipment" }
}`,
      },
      {
        method: 'POST',
        path: '/assets',
        title: 'Create an asset',
        curl: `curl -X POST http://localhost:3001/api/v1/assets \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Yamaha Mixing Console",
    "categoryId": "cat-uuid",
    "assetTag": "AUD-001",
    "serialNumber": "YAMAHA-12345",
    "brand": "Yamaha",
    "model": "MG16XU",
    "condition": "good",
    "purchaseDate": "2025-01-15",
    "purchaseCost": 450000,
    "status": "in_use",
    "branchId": "branch-uuid",
    "custodianMemberId": "member-uuid",
    "location": "Main Auditorium Sound Booth"
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "asset-uuid",
    "name": "Yamaha Mixing Console",
    "assetTag": "AUD-001",
    "status": "in_use"
  }
}`,
        note: 'Asset tags must be unique per church. Conditions: excellent, good, fair, poor. Statuses: in_use, in_storage, under_maintenance, decommissioned, lost, discarded.',
      },
      {
        method: 'POST',
        path: '/assets/:assetId/maintenance',
        title: 'Schedule maintenance',
        curl: `curl -X POST http://localhost:3001/api/v1/assets/asset-uuid/maintenance \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "preventive",
    "description": "Quarterly cleaning and calibration",
    "scheduledDate": "2026-08-01",
    "cost": 25000,
    "vendor": "Yamaha Service Center"
  }'`,
        response: `{
  "success": true,
  "data": { "id": "maint-uuid", "status": "scheduled" }
}`,
        note: 'Maintenance statuses: scheduled, in_progress, completed, cancelled. When maintenance is scheduled, the asset status auto-changes to "under_maintenance".',
      },
      {
        method: 'POST',
        path: '/assets/:assetId/loans',
        title: 'Loan out an asset',
        curl: `curl -X POST http://localhost:3001/api/v1/assets/asset-uuid/loans \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "memberId": "member-uuid",
    "expectedReturnDate": "2026-08-05",
    "notes": "For youth conference"
  }'`,
        response: `{
  "success": true,
  "data": { "id": "loan-uuid", "status": "active" }
}`,
        note: 'When a loan is created, the asset status changes to "in_use". The loan must be returned via the return endpoint to complete the loan cycle.',
      },
      {
        method: 'POST',
        path: '/assets/:assetId/qr',
        title: 'Generate QR code data',
        curl: `curl -X POST http://localhost:3001/api/v1/assets/asset-uuid/qr \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": {
    "qrData": "CHURCHOS:ASSET:asset-uuid",
    "qrImageUrl": "https://api.qrserver.com/v1/create-qr-code/?data=CHURCHOS%3AASSET%3Aasset-uuid"
  }
}`,
        note: 'The QR code encodes a standard format: CHURCHOS:ASSET:<asset-id>. This can be scanned using the POST /assets/scan endpoint for field audits.',
      },
      {
        method: 'POST',
        path: '/assets/scan',
        title: 'Scan an asset QR code',
        curl: `curl -X POST http://localhost:3001/api/v1/assets/scan \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "qrData": "CHURCHOS:ASSET:asset-uuid",
    "location": "Main Auditorium"
  }'`,
        response: `{
  "success": true,
  "data": {
    "asset": {
      "name": "Yamaha Mixing Console",
      "status": "in_use",
      "condition": "good"
    },
    "activeLoan": null,
    "upcomingMaintenance": { "date": "2026-08-01", "type": "preventive" }
  }
}`,
        note: 'Scanning logs an audit trail in AssetScanLog. The response surfaces the current asset state, active loans (if any), and upcoming maintenance.',
      },
    ],
  },

  // ── Engagement ───────────────────────────────────────────────
  {
    id: 'forms',
    category: 'Engagement',
    title: 'Forms & Submission Workflow',
    description:
      'Build custom forms with various field types (text, number, date, dropdown, checkbox, textarea). Forms can be used internally (authenticated submissions) or publicly (anonymous submissions via public token). Submissions go through an approval workflow.',
    prerequisites: 'An authenticated session with form creation permissions.',
    steps: [
      {
        method: 'POST',
        path: '/forms',
        title: 'Create a form',
        curl: `curl -X POST http://localhost:3001/api/v1/forms \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Prayer Request Form",
    "description": "Submit your prayer requests to the pastoral team",
    "fields": [
      {
        "label": "Full Name",
        "type": "text",
        "required": true,
        "order": 1
      },
      {
        "label": "Prayer Request",
        "type": "textarea",
        "required": true,
        "order": 2
      },
      {
        "label": "Urgency",
        "type": "dropdown",
        "required": true,
        "options": ["Low", "Medium", "High", "Critical"],
        "order": 3
      }
    ],
    "isPublic": true
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "form-uuid",
    "title": "Prayer Request Form",
    "isPublic": true,
    "publicToken": "abc123def456",
    "fieldCount": 3
  }
}`,
        note: 'Public forms get a unique public_token. The public submission endpoint is at POST /forms/public/:publicToken/submit (no auth required).',
      },
      {
        method: 'POST',
        path: '/forms/:formId/submit',
        title: 'Submit a form (authenticated)',
        curl: `curl -X POST http://localhost:3001/api/v1/forms/form-uuid/submit \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "values": {
      "Full Name": "Jane Smith",
      "Prayer Request": "Praying for healing for my mother",
      "Urgency": "High"
    }
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "submission-uuid",
    "status": "pending"
  }
}`,
        note: 'Submissions start in "pending" status. They go through an approval workflow: pending → approved or rejected. Attachments can be uploaded as MediaAsset references.',
      },
      {
        method: 'PATCH',
        path: '/forms/:formId/submissions/:submissionId/approve',
        title: 'Approve or reject a submission',
        curl: `curl -X PATCH http://localhost:3001/api/v1/forms/form-uuid/submissions/submission-uuid/approve \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "approve",
    "note": "Prayer request received, pastoral team will follow up"
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "submission-uuid",
    "status": "approved",
    "approvedBy": "John Doe",
    "approvedAt": "2026-07-22T16:00:00.000Z"
  }
}`,
        note: 'Actions: approve or reject. Rejection requires a reason. Approved submissions can be used to trigger follow-up workflows.',
      },
    ],
  },

  {
    id: 'notifications',
    category: 'Engagement',
    title: 'In-App Notifications',
    description:
      'In-app notification system for informing members and staff about important events. Notifications have types (system, attendance, giving, event, pastoral, broadcast) and can be marked as read individually or in bulk.',
    prerequisites: 'An authenticated session.',
    steps: [
      {
        method: 'GET',
        path: '/notifications',
        title: 'List notifications',
        curl: `curl -X GET "http://localhost:3001/api/v1/notifications?page=1&limit=20&type=event" \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": [
    {
      "id": "notif-uuid",
      "type": "event",
      "title": "Youth Conference Reminder",
      "body": "Don\\'t forget the Youth Conference starts tomorrow at 9 AM",
      "readAt": null,
      "createdAt": "2026-07-21T10:00:00.000Z"
    }
  ],
  "meta": { "total": 5, "page": 1, "limit": 20, "totalPages": 1 }
}`,
        note: 'Notifications can be filtered by type (system, attendance, giving, event, pastoral, broadcast) and read status.',
      },
      {
        method: 'GET',
        path: '/notifications/unread-count',
        title: 'Get unread notification count',
        curl: `curl -X GET http://localhost:3001/api/v1/notifications/unread-count \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": { "count": 3 }
}`,
        note: 'Use this endpoint to show a badge on the notification icon in the frontend.',
      },
      {
        method: 'PATCH',
        path: '/notifications/:notificationId/read',
        title: 'Mark a notification as read',
        curl: `curl -X PATCH http://localhost:3001/api/v1/notifications/notif-uuid/read \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": { "id": "notif-uuid", "readAt": "2026-07-22T16:30:00.000Z" }
}`,
      },
      {
        method: 'PATCH',
        path: '/notifications/read-all',
        title: 'Mark all notifications as read',
        curl: `curl -X PATCH http://localhost:3001/api/v1/notifications/read-all \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": { "updatedCount": 3 }
}`,
      },
    ],
  },

  {
    id: 'webhooks',
    category: 'Engagement',
    title: 'Outbound Webhooks',
    description:
      'Subscribe to internal events and receive HTTP callbacks when they occur. Supports events like member.created, transaction.completed, etc. Deliveries include HMAC-SHA256 signed payloads with automatic retry (3 attempts, exponential backoff).',
    prerequisites: 'An authenticated session with church_admin role for management. A publicly accessible endpoint URL on your side to receive webhooks.',
    steps: [
      {
        method: 'POST',
        path: '/webhooks',
        title: 'Create a webhook subscription',
        curl: `curl -X POST http://localhost:3001/api/v1/webhooks \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://my-app.com/webhooks/churchos",
    "events": ["member.created", "transaction.completed"],
    "secret": "my-webhook-secret"
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "webhook-uuid",
    "url": "https://my-app.com/webhooks/churchos",
    "events": ["member.created", "transaction.completed"],
    "isActive": true
  }
}`,
        note: 'The secret is used to sign the payload with HMAC-SHA256. Your endpoint receives the signature in the x-churchos-signature header. Verify it to ensure the request came from ChurchOS.',
      },
      {
        method: 'POST',
        path: '/webhooks/:id/test',
        title: 'Fire a test event',
        curl: `curl -X POST http://localhost:3001/api/v1/webhooks/webhook-uuid/test \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "event": "member.created",
    "payload": { "id": "test-uuid", "name": "Test Member" }
  }'`,
        response: `{
  "success": true,
  "data": {
    "deliveryId": "delivery-uuid",
    "status": "pending"
  }
}`,
        note: 'Use this endpoint to test your webhook integration. The delivery will be attempted immediately.',
      },
      {
        method: 'GET',
        path: '/webhooks/:id/deliveries',
        title: 'View delivery history',
        curl: `curl -X GET http://localhost:3001/api/v1/webhooks/webhook-uuid/deliveries \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": [
    {
      "id": "delivery-uuid",
      "event": "member.created",
      "status": "success",
      "responseStatus": 200,
      "attempts": 1,
      "createdAt": "2026-07-22T17:00:00.000Z"
    },
    {
      "id": "delivery-uuid-2",
      "event": "transaction.completed",
      "status": "failed",
      "responseStatus": 500,
      "attempts": 3,
      "nextRetryAt": null,
      "createdAt": "2026-07-22T16:00:00.000Z"
    }
  ]
}`,
        note: 'Delivery status: pending, success, failed. Failed deliveries are retried up to 3 times with exponential backoff. After exhausting retries, the delivery is marked as failed and not retried again.',
      },
      {
        method: 'DELETE',
        path: '/webhooks/:id',
        title: 'Deactivate a webhook subscription',
        curl: `curl -X DELETE http://localhost:3001/api/v1/webhooks/webhook-uuid \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "message": "Webhook deactivated"
}`,
        note: 'Deactivation sets is_active to false. Future events will not be delivered. The subscription record and delivery history are preserved.',
      },
    ],
  },

  // ── Platform ─────────────────────────────────────────────────
  {
    id: 'photo-upload',
    category: 'Platform',
    title: 'Photo Upload & Management',
    description:
      'Upload profile photos, member photos, and other images. All images are automatically optimized via sharp (WebP conversion, 1200px max, quality 80). Old images are automatically deleted from Supabase Storage when replaced.',
    prerequisites: 'Configured SUPABASE_STORAGE_BUCKET and SUPABASE_* env vars.',
    steps: [
      {
        method: 'POST',
        path: '/media/upload/image',
        title: 'Upload an image',
        curl: `curl -X POST http://localhost:3001/api/v1/media/upload/image \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: multipart/form-data" \\
  -F "file=@/path/to/profile-photo.jpg"`,
        response: `{
  "success": true,
  "data": {
    "url": "https://supabase.co/storage/v1/object/public/media/profiles/uuid/image.webp",
    "assetId": "asset-uuid",
    "mimeType": "image/webp",
    "size": 24500
  }
}`,
        note: 'The image is converted to WebP format, resized to max 1200px, and EXIF metadata is stripped. The returned URL can be used directly in img tags.',
      },
      {
        method: 'PATCH',
        path: '/profiles/me/photo',
        title: 'Set profile photo',
        curl: `curl -X PATCH http://localhost:3001/api/v1/profiles/me/photo \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: multipart/form-data" \\
  -F "file=@/path/to/avatar.jpg"`,
        response: `{
  "success": true,
  "data": {
    "avatarUrl": "https://supabase.co/storage/v1/object/public/media/profiles/uuid/image.webp"
  }
}`,
        note: 'This endpoint handles the upload AND profile update in one call. The old avatar photo is automatically deleted from storage.',
      },
      {
        method: 'PATCH',
        path: '/members/:memberId',
        title: 'Set member photo URL',
        curl: `curl -X PATCH http://localhost:3001/api/v1/members/member-uuid \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "photoUrl": "https://supabase.co/storage/v1/object/public/media/profiles/uuid/image.webp"
  }'`,
        response: `{
  "success": true,
  "data": { "id": "member-uuid", "photoUrl": "https://supabase.co/storage/v1/object/public/media/..." }
}`,
        note: 'After uploading via /media/upload/image, set the returned URL on the member record. The old photo (if any) is deleted from storage.',
      },
    ],
  },

  {
    id: 'sync',
    category: 'Platform',
    title: 'Offline Sync (Mobile)',
    description:
      'Support offline-first mobile clients with cursor-based pull synchronization and idempotent push synchronization. Changes are resolved with last-writer-wins strategy based on client timestamps.',
    prerequisites: 'An authenticated session. Offline data collected on the mobile client.',
    steps: [
      {
        method: 'GET',
        path: '/sync/pull',
        title: 'Pull changes from server',
        curl: `curl -X GET "http://localhost:3001/api/v1/sync/pull?cursor=2026-07-22T00:00:00.000Z&limit=100" \\
  -H "Authorization: Bearer eyJhbGciOi..."`,
        response: `{
  "success": true,
  "data": {
    "changes": [
      {
        "entityType": "member",
        "entityId": "member-uuid",
        "action": "update",
        "data": { "firstName": "Jane", "status": "active" },
        "serverTimestamp": "2026-07-22T10:30:00.000Z"
      }
    ],
    "nextCursor": "2026-07-22T11:00:00.000Z",
    "hasMore": true
  }
}`,
        note: 'The cursor is a timestamp. Pass the last serverTimestamp from the previous response as the cursor for the next pull. Set hasMore=false to stop pulling.',
      },
      {
        method: 'POST',
        path: '/sync/push',
        title: 'Push changes to server',
        curl: `curl -X POST http://localhost:3001/api/v1/sync/push \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "changes": [
      {
        "entityType": "member",
        "entityId": "member-uuid",
        "action": "update",
        "data": { "phone": "+2348012345679" },
        "clientTimestamp": "2026-07-22T09:00:00.000Z"
      }
    ]
  }'`,
        response: `{
  "success": true,
  "data": {
    "results": [
      {
        "entityId": "member-uuid",
        "status": "applied",
        "serverTimestamp": "2026-07-22T11:00:00.000Z"
      }
    ]
  }
}`,
        note: 'Idempotency: if the same entity_id + action combination has already been processed (based on clientTimestamp), the server skips it and returns the existing result. Conflict resolution uses last-writer-wins.',
      },
      {
        method: 'POST',
        path: '/sync/mark-synced',
        title: 'Mark items as synced',
        curl: `curl -X POST http://localhost:3001/api/v1/sync/mark-synced \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "entityIds": ["member-uuid", "member-uuid-2"]
  }'`,
        response: `{
  "success": true,
  "data": {
    "marked": 2
  }
}`,
        note: 'After the client has successfully applied pushed items, call this endpoint to acknowledge receipt. This prevents redundant sync operations.',
      },
    ],
  },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderFlowStep(step: FlowStep): string {
  const methodBadge = step.method !== '-'
    ? `<span class="method-badge method-${step.method}">${step.method}</span>`
    : '';
  const pathHtml = step.path !== '-'
    ? `<code class="step-path">${escapeHtml(step.path)}</code>`
    : '';

  let curlSection = '';
  if (step.curl) {
    curlSection = `<div class="code-header">curl</div>
<pre class="code-block"><code>${escapeHtml(step.curl)}</code></pre>`;
  }

  let responseSection = '';
  if (step.response) {
    responseSection = `<div class="code-header">response</div>
<pre class="code-block"><code>${escapeHtml(step.response)}</code></pre>`;
  }

  const noteSection = step.note
    ? `<div class="callout"><strong>Note:</strong> ${escapeHtml(step.note)}</div>`
    : '';

  return `<div class="flow-step">
  <div class="step-heading">
    <span class="step-number">●</span>
    ${methodBadge}${pathHtml}
    <span class="step-title">${escapeHtml(step.title)}</span>
  </div>
  ${curlSection}
  ${responseSection}
  ${noteSection}
</div>`;
}

function renderFlow(flow: Flow): string {
  const stepsHtml = flow.steps.map(renderFlowStep).join('\n');
  const prereqHtml = flow.prerequisites
    ? `<div class="callout prereq"><strong>Prerequisites:</strong> ${escapeHtml(flow.prerequisites)}</div>`
    : '';

  return `<section id="flow-${flow.id}" class="flow-section">
  <div class="flow-header">
    <h2>${escapeHtml(flow.title)}</h2>
    <span class="step-badge">${flow.steps.length} steps</span>
  </div>
  <p class="flow-description">${escapeHtml(flow.description)}</p>
  ${prereqHtml}
  <div class="steps-container">
    ${stepsHtml}
  </div>
</section>`;
}

export function renderGuidePage(baseUrl: string, swaggerUrl: string): string {
  const categories = new Map<string, Flow[]>();
  for (const flow of ALL_FLOWS) {
    if (!categories.has(flow.category)) {
      categories.set(flow.category, []);
    }
    categories.get(flow.category)!.push(flow);
  }

  const sidebarNav = Array.from(categories.entries()).map(([category, flows]) => {
    const links = flows.map((f) =>
      `<a href="#flow-${f.id}">${escapeHtml(f.title)} <span class="count">${f.steps.length}</span></a>`,
    ).join('\n');
    return `<div class="nav-category">${escapeHtml(category)}</div>\n${links}`;
  }).join('\n');

  const contentHtml = Array.from(categories.entries()).map(([_category, flows]) => {
    return flows.map(renderFlow).join('\n');
  }).join('\n');

  const totalSteps = ALL_FLOWS.reduce((sum, f) => sum + f.steps.length, 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChurchOS API — Developer Guide</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0b1120;
      color: #e2e8f0;
      line-height: 1.8;
    }

    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: #0b1120; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #475569; }

    .sidebar {
      position: fixed; top: 0; left: 0; width: 280px; height: 100vh;
      background: #0f172a; border-right: 1px solid #1e293b;
      overflow-y: auto; z-index: 100; padding-bottom: 2rem;
    }

    .sidebar-header {
      padding: 1.75rem 1.25rem;
      border-bottom: 1px solid #1e293b;
      background: linear-gradient(135deg, #0f172a 0%, #1a1f2e 100%);
    }
    .sidebar-header h1 {
      font-size: 1.125rem; font-weight: 700; color: #f1f5f9;
      letter-spacing: -0.02em;
    }
    .sidebar-header .subtitle {
      font-size: 0.75rem; color: #94a3b8; margin-top: 0.375rem;
    }
    .sidebar-header .meta-info {
      margin-top: 0.75rem; font-size: 0.6875rem; color: #475569;
    }
    .sidebar-header .meta-info span { display: block; margin-top: 0.125rem; }
    .sidebar-header .meta-info strong { color: #64748b; }
    .sidebar-header .badge-row { margin-top: 0.625rem; display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .sidebar-header .badge-row .badge {
      font-size: 0.625rem; font-weight: 600; padding: 0.1875rem 0.5rem;
      border-radius: 9999px; background: rgba(99,102,241,0.12); color: #818cf8;
    }
    .sidebar-header .badge-row .badge.outline {
      background: transparent; border: 1px solid #334155; color: #64748b;
    }

    .sidebar-nav { padding: 0.75rem 0; }
    .sidebar-nav a {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.5rem 1.25rem; color: #94a3b8; text-decoration: none;
      font-size: 0.8125rem; transition: all 0.15s ease; border-left: 2px solid transparent;
    }
    .sidebar-nav a:hover {
      color: #e2e8f0; background: rgba(99,102,241,0.06);
      border-left-color: #6366f1;
    }
    .sidebar-nav a .count {
      margin-left: auto; font-size: 0.625rem; color: #475569;
      background: #1e293b; padding: 0.0625rem 0.375rem; border-radius: 4px;
    }
    .sidebar-nav .nav-category {
      padding: 1rem 1.25rem 0.25rem; font-size: 0.625rem;
      font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
      color: #475569;
    }

    .main { margin-left: 280px; min-height: 100vh; }

    .hero {
      padding: 3rem 3.5rem 2.5rem;
      background: linear-gradient(135deg, #0f172a 0%, #0b1120 100%);
      border-bottom: 1px solid #1e293b;
    }
    .hero h1 {
      font-size: 2.25rem; font-weight: 800; color: #f1f5f9;
      letter-spacing: -0.03em; line-height: 1.2;
    }
    .hero h1 span { color: #818cf8; }
    .hero p {
      margin-top: 0.75rem; color: #94a3b8; max-width: 720px; font-size: 0.9375rem;
      line-height: 1.8;
    }
    .hero .meta-grid {
      margin-top: 1.5rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }
    .hero .meta-item {
      background: #1e293b; border: 1px solid #334155; border-radius: 8px;
      padding: 0.75rem 1rem;
    }
    .hero .meta-item .label { font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; font-weight: 600; }
    .hero .meta-item .value { font-size: 0.8125rem; color: #e2e8f0; margin-top: 0.25rem; font-family: 'JetBrains Mono', monospace; }
    .hero .meta-item .value.url { color: #818cf8; }

    .flow-section {
      padding: 2.5rem 3.5rem;
      border-bottom: 1px solid #1e293b;
      scroll-margin-top: 1rem;
    }
    .flow-section:last-of-type { border-bottom: none; }

    .flow-header {
      display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;
    }
    .flow-header h2 {
      font-size: 1.375rem; font-weight: 700; color: #f1f5f9;
      letter-spacing: -0.02em;
    }
    .flow-header .step-badge {
      font-size: 0.625rem; font-weight: 600; color: #818cf8;
      background: rgba(99,102,241,0.12); padding: 0.125rem 0.5rem;
      border-radius: 9999px;
    }

    .flow-description {
      font-size: 0.875rem; color: #94a3b8; max-width: 720px;
      line-height: 1.8; margin-bottom: 1rem;
    }

    .callout {
      background: rgba(99,102,241,0.06); border-left: 3px solid #6366f1;
      padding: 0.75rem 1rem; margin: 1rem 0; border-radius: 0 6px 6px 0;
      font-size: 0.8125rem; color: #c7d2fe; line-height: 1.7;
    }
    .callout strong { color: #a5b4fc; }
    .callout.prereq {
      background: rgba(245,158,11,0.06); border-left-color: #f59e0b;
      color: #fde68a;
    }
    .callout.prereq strong { color: #fbbf24; }

    .steps-container { margin-top: 1.25rem; }

    .flow-step {
      background: #1e293b; border: 1px solid #334155; border-radius: 10px;
      padding: 1.25rem 1.5rem; margin-bottom: 1rem;
      transition: border-color 0.15s ease;
    }
    .flow-step:hover { border-color: #475569; }

    .step-heading {
      display: flex; align-items: center; gap: 0.625rem;
      margin-bottom: 0.75rem;
    }
    .step-number {
      font-size: 0.5rem; color: #6366f1;
    }
    .step-title {
      font-size: 0.875rem; font-weight: 600; color: #e2e8f0;
    }
    .step-path {
      font-family: 'JetBrains Mono', monospace; font-size: 0.75rem;
      color: #818cf8; background: rgba(99,102,241,0.08);
      padding: 0.125rem 0.5rem; border-radius: 4px;
    }

    .method-badge {
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 0.5625rem; font-weight: 700; padding: 0.1875rem 0.4375rem;
      border-radius: 4px; text-transform: uppercase; min-width: 42px;
      letter-spacing: 0.06em; font-family: 'JetBrains Mono', monospace;
    }
    .method-GET { background: rgba(16,185,129,0.15); color: #34d399; }
    .method-POST { background: rgba(99,102,241,0.15); color: #818cf8; }
    .method-PATCH { background: rgba(245,158,11,0.15); color: #fbbf24; }
    .method-PUT { background: rgba(59,130,246,0.15); color: #60a5fa; }
    .method-DELETE { background: rgba(239,68,68,0.15); color: #f87171; }

    .code-header {
      font-size: 0.625rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.08em; color: #475569; margin-bottom: 0.375rem;
      margin-top: 0.75rem;
    }
    .code-block {
      background: #0b1120; border: 1px solid #334155; border-radius: 8px;
      padding: 1rem; overflow-x: auto; margin-bottom: 0.25rem;
    }
    .code-block code {
      font-family: 'JetBrains Mono', monospace; font-size: 0.75rem;
      line-height: 1.7; color: #a5b4fc; white-space: pre;
    }

    .footer {
      padding: 2rem 3.5rem; text-align: center; color: #475569; font-size: 0.75rem;
      border-top: 1px solid #1e293b;
    }
    .footer a { color: #6366f1; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }

    @media (max-width: 900px) {
      .sidebar { display: none; }
      .main { margin-left: 0; }
      .hero, .flow-section { padding: 1.5rem; }
      .hero .meta-grid { grid-template-columns: 1fr; }
      .flow-step { padding: 1rem; }
      .step-heading { flex-wrap: wrap; }
      .hero h1 { font-size: 1.5rem; }
      .flow-header h2 { font-size: 1.125rem; }
    }

    @media print {
      .sidebar { display: none; }
      .main { margin-left: 0; }
      .flow-section { break-inside: avoid; }
    }
  </style>
</head>
<body>

<aside class="sidebar">
  <div class="sidebar-header">
    <h1>ChurchOS API</h1>
    <div class="subtitle">Developer Integration Guide</div>
    <div class="meta-info">
      <span><strong>Base URL:</strong></span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:0.6875rem;color:#64748b;word-break:break-all">${escapeHtml(baseUrl)}</span>
    </div>
    <div class="badge-row">
      <span class="badge">${ALL_FLOWS.length} flows</span>
      <span class="badge">${totalSteps} steps</span>
      <a href="${escapeHtml(swaggerUrl)}" target="_blank" class="badge outline" style="text-decoration:none;cursor:pointer">Swagger UI →</a>
    </div>
  </div>
  <nav class="sidebar-nav">
    ${sidebarNav}
  </nav>
</aside>

<div class="main">
  <div class="hero">
    <h1>Developer <span>Guide</span></h1>
    <p>
      A comprehensive integration guide for the ChurchOS API. This guide walks through
      each feature flow step-by-step, showing the exact API calls, request formats,
      response shapes, and important business rules you need to know when building
      your frontend integration.
    </p>
    <div class="meta-grid">
      <div class="meta-item">
        <div class="label">Base URL</div>
        <div class="value url">${escapeHtml(baseUrl)}</div>
      </div>
      <div class="meta-item">
        <div class="label">Auth Scheme</div>
        <div class="value">Bearer JWT (Supabase)</div>
      </div>
      <div class="meta-item">
        <div class="label">Response Format</div>
        <div class="value">{ success, data, meta? }</div>
      </div>
      <div class="meta-item">
        <div class="label">Flows</div>
        <div class="value">${ALL_FLOWS.length} flows · ${totalSteps} steps</div>
      </div>
    </div>
  </div>

  ${contentHtml}

  <div class="footer">
    ChurchOS — Church Management &amp; Digital Ministry Platform &bull;
    <a href="${escapeHtml(swaggerUrl)}" target="_blank">Interactive Swagger Docs</a> &bull;
    Built with NestJS + Prisma
  </div>
</div>

</body>
</html>`;
}
