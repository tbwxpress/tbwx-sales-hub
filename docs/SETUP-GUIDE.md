# Sales Hub -- Setup Guide

How to set up and deploy the Sales Hub for a new client.

---

## 1. Overview

The Sales Hub is a web-based dashboard for managing leads and WhatsApp conversations. It connects to:

- **Google Sheets** -- stores all lead data, messages, users, and quick replies
- **WhatsApp Business API** -- sends and receives messages through Meta's Cloud API
- **SQLite/Turso database** -- stores contacts, call logs, notes, and tasks locally

To deploy for a new client, you need:

1. Two Google Sheets (one for leads, one for the hub)
2. A WhatsApp Business account with Cloud API access
3. Google OAuth credentials (for Sheets API access)
4. A hosting platform (Vercel recommended)

---

## 2. Google Sheets Setup

You need **two** Google Sheets. Share both with the Google OAuth service email (or the user whose refresh token you use) with **Editor** access.

### Sheet 1: Leads Sheet (LEADS_SHEET_ID)

This sheet holds all your lead data and incoming WhatsApp replies.

#### Tab: "Leads"

Row 1 must have headers. The system reads columns A through AC (29 columns). Here is the exact layout:

| Column | Letter | Header Name | Filled By |
|--------|--------|-------------|-----------|
| 1 | A | id | Meta Ads / n8n (auto) |
| 2 | B | created_time | Meta Ads / n8n (auto) |
| 3 | C | ad_id | Meta Ads (auto) |
| 4 | D | ad_name | Meta Ads (auto) |
| 5 | E | adset_id | Meta Ads (auto) |
| 6 | F | adset_name | Meta Ads (auto) |
| 7 | G | form_id | Meta Ads (auto) |
| 8 | H | campaign_name | Meta Ads (auto) |
| 9 | I | form_name | Meta Ads (auto) |
| 10 | J | is_organic | Meta Ads (auto) |
| 11 | K | retailer_item_id | Meta Ads (auto) |
| 12 | L | platform | Meta Ads (auto) |
| 13 | M | model_interest | Lead form answer |
| 14 | N | experience | Lead form answer |
| 15 | O | timeline | Lead form answer |
| 16 | P | full_name | Lead form answer |
| 17 | Q | phone | Lead form answer (may have "p:" prefix -- auto-stripped) |
| 18 | R | email | Lead form answer |
| 19 | S | city | Lead form answer |
| 20 | T | state | Lead form answer |
| 21 | U | (reserved) | -- |
| 22 | V | lead_status | System (auto) / Manual |
| 23 | W | attempted_contact | System (auto) / Manual |
| 24 | X | first_call_date | Manual |
| 25 | Y | wa_message_id | System (auto) |
| 26 | Z | lead_priority | System (auto) / Manual |
| 27 | AA | assigned_to | System (auto) / Manual |
| 28 | AB | next_followup | System (auto) / Manual |
| 29 | AC | notes | Manual |

**Key notes:**

- Columns A-K (1-11) are auto-filled by Meta Ads lead forms via the n8n workflow. If your client does not use Meta Ads, you can leave these blank but the columns must still exist.
- Columns L-T (12-20) come from the lead form answers. The exact questions depend on the client's ad form.
- Column U (21) is reserved/unused -- leave the header blank or use it for anything.
- Columns V-AC (22-29) are managed by the Sales Hub. These are the columns the system reads and writes.
- If a lead has no status, the system defaults it to "NEW".

**Valid lead statuses:** NEW, DECK_SENT, CONTACTED, REPLIED, INTERESTED, HOT, CONVERTED, LOST

**Valid lead priorities:** HOT, WARM, COLD

#### Tab: "Replies"

This tab stores incoming WhatsApp messages, logged by the n8n webhook workflow.

Row 1 must have these headers:

| Column | Letter | Header Name | Description |
|--------|--------|-------------|-------------|
| 1 | A | Timestamp | When the message was received |
| 2 | B | From_Phone | Sender's phone number |
| 3 | C | Contact_Name | Sender's WhatsApp name |
| 4 | D | Message_Type | text, image, audio, etc. |
| 5 | E | Message_Body | The message content |
| 6 | F | Message_ID | WhatsApp message ID |
| 7 | G | event_type | Must be "message" for the system to read it |

All columns are auto-filled by the n8n WhatsApp Inbox Logger workflow.

---

### Sheet 2: Hub Sheet (HUB_SHEET_ID)

This sheet holds the Sales Hub's own data: users, sent messages, and quick replies.

#### Tab: "Users"

Row 1 must have these headers:

| Column | Letter | Header Name | Description |
|--------|--------|-------------|-------------|
| 1 | A | id | Auto-generated (e.g., u_1710000000000) |
| 2 | B | name | User's display name |
| 3 | C | email | Login email (must be unique) |
| 4 | D | password_hash | Bcrypt hash (auto-generated) |
| 5 | E | role | "admin" or "agent" |
| 6 | F | can_assign | TRUE or FALSE |
| 7 | G | active | TRUE or FALSE |

**Note:** The seed-admin script creates the first admin user in the SQLite/Turso database, not in this sheet. This sheet is used for Google Sheets-based user management. If your deployment uses only the database for auth, you can leave this tab empty but it must exist.

#### Tab: "SentMessages"

Row 1 must have these headers:

| Column | Letter | Header Name | Description |
|--------|--------|-------------|-------------|
| 1 | A | timestamp | When the message was sent (ISO format) |
| 2 | B | phone | Recipient's phone number |
| 3 | C | name | Recipient's name |
| 4 | D | message | Message text that was sent |
| 5 | E | sent_by | Name of the user who sent it |
| 6 | F | wa_message_id | WhatsApp message ID returned by API |
| 7 | G | status | Delivery status |
| 8 | H | template_used | Template name if a template was used |

All columns are auto-filled by the system when a message is sent from the Sales Hub.

#### Tab: "QuickReplies"

Row 1 must have these headers:

| Column | Letter | Header Name | Description |
|--------|--------|-------------|-------------|
| 1 | A | id | Auto-generated (e.g., qr_1710000000000) |
| 2 | B | category | Category for grouping (e.g., "Greeting", "Follow-up") |
| 3 | C | title | Short name shown in the UI |
| 4 | D | message | The full message template text |
| 5 | E | created_by | Name of user who created it |
| 6 | F | created_at | Creation timestamp (ISO format) |

Quick replies are pre-written message templates your team can use to send common responses quickly.

---

## 3. WhatsApp Business API Setup

You need three values from Meta:

### Step-by-step

1. Go to [Meta Business Suite](https://business.facebook.com/) and log in.
2. Navigate to **Settings > Business Info** and note your **WABA ID** (WhatsApp Business Account ID).
3. Go to [Meta for Developers](https://developers.facebook.com/) and open your app.
4. Under **WhatsApp > API Setup**, you will find:
   - **Phone Number ID** -- the ID of your registered WhatsApp number
   - **Temporary Access Token** -- works for 24 hours (for testing)
5. For a permanent token, create a **System User** in Business Settings:
   - Go to Business Settings > Users > System Users
   - Add a system user with Admin role
   - Generate a token with the `whatsapp_business_messaging` permission
   - This token does not expire

### Values you need

| Env Variable | Where to find it |
|-------------|-----------------|
| WHATSAPP_WABA_ID | Business Settings > Business Info |
| WHATSAPP_PHONE_NUMBER_ID | Developers > WhatsApp > API Setup |
| WHATSAPP_TOKEN | System User token (see step 5 above) |
| WHATSAPP_WEBHOOK_VERIFY_TOKEN | You choose this -- any random string |

---

## 4. Google OAuth Setup

The Sales Hub reads and writes Google Sheets using OAuth2. You need a Client ID, Client Secret, and a Refresh Token.

### Step-by-step

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or use an existing one).
3. Enable the **Google Sheets API**:
   - Go to APIs & Services > Library
   - Search for "Google Sheets API" and click Enable
4. Create OAuth credentials:
   - Go to APIs & Services > Credentials
   - Click "Create Credentials" > OAuth client ID
   - Choose "Web application"
   - Under "Authorized redirect URIs", add: `https://developers.google.com/oauthplayground`
   - Save the **Client ID** and **Client Secret**
5. Get a Refresh Token:
   - Go to [OAuth Playground](https://developers.google.com/oauthplayground)
   - Click the gear icon (top right) and check "Use your own OAuth credentials"
   - Enter your Client ID and Client Secret
   - In the left panel, find "Google Sheets API v4" and select `https://www.googleapis.com/auth/spreadsheets`
   - Click "Authorize APIs" and sign in with the Google account that owns the sheets
   - Click "Exchange authorization code for tokens"
   - Copy the **Refresh Token**

### Values you need

| Env Variable | Where to find it |
|-------------|-----------------|
| GOOGLE_CLIENT_ID | Cloud Console > Credentials |
| GOOGLE_CLIENT_SECRET | Cloud Console > Credentials |
| GOOGLE_REFRESH_TOKEN | OAuth Playground (step 5 above) |

**Important:** Share both Google Sheets with the Google account you authorized in step 5 (Editor access).

---

## 5. Deployment Checklist

Follow these steps in order:

### Step 1: Clone the repo

```
git clone <repo-url> sales-hub
cd sales-hub
npm install
```

### Step 2: Set up environment variables

```
cp .env.example .env.local
```

Open `.env.local` in a text editor and fill in every value. See sections 3 and 4 above for where to get each one.

Generate the JWT_SECRET:

```
openssl rand -hex 32
```

Paste the output as the JWT_SECRET value.

### Step 3: Create the Google Sheets

Create two Google Sheets and set up the tabs and headers exactly as described in Section 2 above.

**Leads Sheet:**
- Create a Google Sheet
- Rename the first tab to "Leads"
- Add all 29 column headers (A through AC) in row 1
- Add a second tab called "Replies"
- Add the 7 column headers in row 1

**Hub Sheet:**
- Create a second Google Sheet
- Rename the first tab to "Users"
- Add the 7 column headers in row 1
- Add a second tab called "SentMessages"
- Add the 8 column headers in row 1
- Add a third tab called "QuickReplies"
- Add the 6 column headers in row 1

Copy each sheet's ID from the URL:
```
https://docs.google.com/spreadsheets/d/COPY_THIS_PART/edit
```

Paste them into `.env.local` as LEADS_SHEET_ID and HUB_SHEET_ID.

### Step 4: Set up WhatsApp

Follow the steps in Section 3 to get your WhatsApp credentials. Paste them into `.env.local`.

### Step 5: Create the first admin user

```
npm run seed-admin
```

This reads ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD from your `.env.local` and creates an admin user in the database. Change the password after your first login.

### Step 6: Test locally

```
npm run dev
```

The app starts at `http://localhost:3458`. Log in with the admin email and password you set.

### Step 7: Deploy to Vercel

1. Push the repo to GitHub.
2. Go to [Vercel](https://vercel.com/) and import the repo.
3. In the Vercel project settings, add all the environment variables from your `.env.local`.
4. Deploy.
5. Update `NEXT_PUBLIC_APP_URL` in Vercel's env vars to your production URL.

### Step 8: Configure the Meta webhook

For incoming WhatsApp messages to appear in the Sales Hub:

1. In Meta for Developers, go to your app > WhatsApp > Configuration.
2. Set the Callback URL to: `https://your-domain.com/api/webhook/whatsapp`
3. Set the Verify Token to the same value as `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in your env.
4. Subscribe to the `messages` field.

If you also use an n8n workflow for logging replies to the Replies tab, configure that webhook separately in n8n.

---

## 6. Column Mapping Reference

If a client's lead sheet has columns in a different order, you need to update `src/config/client.ts`. Here is the default mapping:

### Read Mapping (LEAD_COLUMN_MAP)

Maps field names to column **index** (0-based, where A=0, B=1, etc.):

| Field Name | Column Letter | Index | Description |
|------------|--------------|-------|-------------|
| id | A | 0 | Lead ID from Meta |
| created_time | B | 1 | When the lead was created |
| campaign_name | H | 7 | Meta Ads campaign name |
| platform | L | 11 | Platform (facebook, instagram) |
| model_interest | M | 12 | Lead form: business model interest |
| experience | N | 13 | Lead form: prior experience |
| timeline | O | 14 | Lead form: timeline to start |
| full_name | P | 15 | Lead's full name |
| phone | Q | 16 | Lead's phone number |
| email | R | 17 | Lead's email address |
| city | S | 18 | Lead's city |
| state | T | 19 | Lead's state |
| lead_status | V | 21 | Current status in the sales funnel |
| attempted_contact | W | 22 | Whether contact was attempted |
| first_call_date | X | 23 | Date of first call |
| wa_message_id | Y | 24 | WhatsApp message ID (last sent) |
| lead_priority | Z | 25 | HOT, WARM, or COLD |
| assigned_to | AA | 26 | Name of assigned sales agent |
| next_followup | AB | 27 | Date for next follow-up |
| notes | AC | 28 | Free-text notes |

### Write Mapping (LEAD_WRITE_COLUMNS)

Maps field names to column **letter** for update operations:

| Field Name | Column Letter |
|------------|--------------|
| lead_status | V |
| attempted_contact | W |
| first_call_date | X |
| wa_message_id | Y |
| lead_priority | Z |
| assigned_to | AA |
| next_followup | AB |
| notes | AC |

### How to change the mapping

Open `src/config/client.ts` and edit the two objects:

- **LEAD_COLUMN_MAP** -- change the index numbers to match where each field is in the client's sheet. Remember: A=0, B=1, C=2, ... Z=25, AA=26, AB=27, etc.
- **LEAD_WRITE_COLUMNS** -- change the column letters to match. These must be consistent with the indices above.

For example, if a client has `full_name` in column D instead of P:
- Change `full_name: 15` to `full_name: 3` in LEAD_COLUMN_MAP
- (No change needed in LEAD_WRITE_COLUMNS since full_name is read-only)

---

## 7. Custom Tab Names

If you want to use different tab names (for example, if the sheet is in another language), set these in `.env.local`:

| Env Variable | Default Value | Description |
|-------------|--------------|-------------|
| LEADS_TAB_NAME | Leads | Tab name for lead data in the leads sheet |
| REPLIES_TAB_NAME | Replies | Tab name for incoming messages in the leads sheet |
| SENT_MESSAGES_TAB_NAME | SentMessages | Tab name for sent messages in the hub sheet |
| USERS_TAB_NAME | Users | Tab name for users in the hub sheet |
| QUICK_REPLIES_TAB_NAME | QuickReplies | Tab name for quick replies in the hub sheet |

---

## 8. Environment Variables -- Full Reference

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| NEXT_PUBLIC_BRAND_NAME | Yes | My Brand Sales Hub | Shown in the UI header |
| NEXT_PUBLIC_BRAND_SHORT | Yes | MB | Short name / initials |
| NEXT_PUBLIC_BRAND_LOGO | No | /logo.png | Path to logo image |
| NEXT_PUBLIC_BRAND_DESCRIPTION | No | Sales dashboard | Meta description |
| JWT_SECRET | Yes | (64-char hex string) | Used to sign login tokens |
| SESSION_COOKIE_NAME | No | saleshub_session | Cookie name for sessions |
| ADMIN_NAME | Yes | Admin | Name for the first admin user |
| ADMIN_EMAIL | Yes | admin@example.com | Email for admin login |
| ADMIN_PASSWORD | Yes | (strong password) | Password for admin login |
| GOOGLE_CLIENT_ID | Yes | 467943...apps.googleusercontent.com | From Google Cloud Console |
| GOOGLE_CLIENT_SECRET | Yes | GOCSPX-... | From Google Cloud Console |
| GOOGLE_REFRESH_TOKEN | Yes | 1//0e... | From OAuth Playground |
| LEADS_SHEET_ID | Yes | 1C1RZ9UQ... | Google Sheet ID for leads |
| HUB_SHEET_ID | Yes | (sheet ID) | Google Sheet ID for hub data |
| LEADS_TAB_NAME | No | Leads | Custom tab name |
| REPLIES_TAB_NAME | No | Replies | Custom tab name |
| SENT_MESSAGES_TAB_NAME | No | SentMessages | Custom tab name |
| USERS_TAB_NAME | No | Users | Custom tab name |
| QUICK_REPLIES_TAB_NAME | No | QuickReplies | Custom tab name |
| WHATSAPP_PHONE_NUMBER_ID | Yes | 940321572508130 | From Meta API Setup |
| WHATSAPP_TOKEN | Yes | EAAx... | System user token |
| WHATSAPP_WABA_ID | Yes | 1554759132282286 | WhatsApp Business Account ID |
| WHATSAPP_WEBHOOK_VERIFY_TOKEN | No | saleshub-webhook-verify | For webhook verification |
| TURSO_DATABASE_URL | No | libsql://db-name.turso.io | Leave empty for local SQLite |
| TURSO_AUTH_TOKEN | No | (token) | Required if using Turso |
| NEXT_PUBLIC_APP_URL | Yes | https://hub.example.com | Your deployment URL |
