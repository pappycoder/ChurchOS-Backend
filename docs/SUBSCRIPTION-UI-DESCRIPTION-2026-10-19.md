# Subscription interface description

Status: proposed subscription UI, not an implemented screen. Essentials is already advertised at 100 members. Member login-role retirement is implemented separately and requires its migration/deployment.

## Account model

The Members area remains a church directory: adding a person does not create a login. Staff accounts are managed in Users/Staff with an explicitly selected staff role. No Member option or implicit default role appears. Every enabled login profile consumes one staff seat, regardless of how many roles it holds. Existing member-only profiles become inactive/unassigned on migration; administrators must intentionally assign a supported staff role before restoring access. Mixed-role profiles retain their staff roles.

## Administrator: Plan & Billing

Provide a Plan & Billing destination in settings/account navigation, visible to users with billing read permission. The page opens with the current plan, subscription state, billing period, renewal date and a Manage plan button. Checkout remains restricted to billing update permission.

Example Essentials account:

```text
Plan & Billing
Essentials                                      Active
₦10,000 / month                                  Renew by: 19 Nov 2026

Members              87 / 100                    [usage bar: 87%]
Staff accounts        1 / 2                      [usage bar: 50%]
Locations             1 / 1                      [usage bar: full]

[Manage plan]    [Payment history]
```

Values and dates are illustrative. Renewal remains manual; the interface must not imply automatic charging.

Each usage card states what counts: non-archived members; enabled staff plus reserved invitations; non-archived locations including HQ. Show a warning at 80% and a stronger warning at 90% for member capacity. At full capacity show an actionable notice for that resource. A full location allowance does not block unrelated work such as adding members.

## Members: near and at capacity

Above the member list, an administrator sees `87 of 100 members used` and a View plan action. A nearby notice says `You're approaching your member allowance. Community supports 300 members.` Keep the member table and existing authorized actions usable.

At 100 members, selecting Add member opens a small limit dialog:

```text
Member allowance reached
Essentials includes 100 members. Your church is using all 100.
Choose Community for up to 300 members, or archive records you no longer use.

[View plans]    [Close]
```

An ordinary authorized staff user sees `Your church has reached its member allowance. Contact your administrator.` They do not see private billing details or an unauthorized checkout action. The server performs the same validation if a limit changes while a form is open. Keep entered form data so it can be retried after an upgrade or a slot is released.

Imports preview how many new records fit after deduplication. Show accepted/rejected row counts according to the existing import contract, explain capacity failures and offer a downloadable rejection report where supported. Offline submissions remain queued with a visible limit message and a retry action; never discard a draft because the plan is full.

## Staff and locations

Users/Staff shows `1 of 2 staff accounts used`. Invite staff requires an explicit role selection; there is no Member login role. A pending invitation visibly reserves a seat. If the second seat is reserved, show `2 of 2 used, including 1 pending invitation`. Failed/expired invitations release their reservations according to the backend policy.

At the staff allowance, show `All 2 staff seats are in use. Community includes 5.` Administrators can review active staff and pending invitations or view plans. Assigning several roles to one account still uses one seat. Reactivation also checks capacity.

Locations shows `1 of 1 locations used (including HQ)`. An attempt to add or restore another location shows `Network includes up to 3 locations.` Do not suggest Community as a location upgrade because it also allows one location.

## Plan comparison and checkout

Manage plan opens cards for Essentials (100 members, 1 location, 2 staff), Community (300, 1, 5), Network (1,500, 3, 15) and Enterprise (agreed). Show monthly/yearly prices, the current-plan marker, cumulative feature differences and clear actions: Current plan, Upgrade, Schedule downgrade or Contact sales.

Before payment show the selected plan, effective date, amount due now, subsequent renewal terms and any agreed credit/proration. Do not offer an active-plan upgrade until the backend supports it: checkout currently rejects an active subscription. On successful verified payment, refresh usage limits and feature access. Pending/failed verification retains the previous entitlements and offers a safe status check/retry.

Warn before scheduling a downgrade if usage is above the new allowance or features will stop accepting new activity. Preserve stored records and authorized historical access/exports; explain the exact limits and effective date. No automatic deletion.

## Features outside the current plan

Primary navigation shows the church's available features filtered by the user's permissions. Administrators discover higher-tier features in the plan comparison or a clearly labeled Upgrade section. A direct link to a feature outside the plan shows a short explanation, the required plan and View plans for billing administrators; staff receive Contact your administrator. Users without the underlying permission receive the usual access denial rather than an upgrade prompt.

## Expiry and payments

Before expiry, show a renewal reminder to billing administrators. After expiry, show a subscription-required screen with plan/expiry details and Renew subscription for authorized administrators. Other staff see a clear contact-administrator message. Account recovery, sign-out and required billing/payment verification remain reachable. Do not describe renewals as automatic while they are manual.

## Implementation sequence

First implement the authoritative entitlement/usage API and transactional quotas, then the usage cards and limit dialogs, then active-plan upgrades and feature availability. Backend, background workers and web must enforce the same entitlement contract. This document describes the intended UI; it does not claim these new subscription screens are deployed.
