# Base — early-access registration

Public entry point: https://parc-labs.github.io/Base/#early-access

The form is separate from Supabase Auth. An expression of interest does **not**
create an account, promise admission or charge the visitor.

## What is recorded

- Normalised email address (unique).
- Optional practice category and short statement of intended use.
- An optional URL referral code (?ref=are-na, ?ref=reddit, etc.).
- Explicit email opt-in, the consent version and the time of signup.
- Internal status, initially `interested`.

The separate `early_access_privacy_requests` table collects requests to
withdraw, inspect or correct data. Those requests **must be verified by email**
before acting: anyone could type someone else's address into a form.

Neither table grants SELECT/UPDATE/DELETE to browser roles. Anon and
authenticated clients can only INSERT specified columns. Supabase administrators
may inspect and manage records through SQL Editor/Table Editor. No API secret is
included in the public application.

## Review registrations (admin only)

Run in the dedicated Base project's Supabase SQL Editor:

```sql
select created_at, email, practice, intended_use, source, status
from public.early_access_signups
order by created_at desc;
```

Summary by channel:

```sql
select source, count(*) as registrations
from public.early_access_signups
group by source order by registrations desc;
```

Referral links:

- `https://parc-labs.github.io/Base/?ref=arena#early-access`
- `https://parc-labs.github.io/Base/?ref=reddit#early-access`
- `https://parc-labs.github.io/Base/?ref=outreach#early-access`

Sources are restricted to lowercase letters, digits, hyphens and underscores,
up to 40 characters. Invalid sources are saved as `direct`.

## Invitation process

1. Review submissions. This has **no automated email sender**.
2. Personally contact interesting people using an appropriate private
   sender address. Include a way to reply and opt out of further emails.
3. If the user has not yet signed in, preapprove the email using an
   administrator-only SQL Editor session:

```sql
insert into private.approved_member_emails(email)
values (lower('invited.person@example.com'))
on conflict do nothing;
```

4. Invite them to `https://parc-labs.github.io/Base/#signin` for magic-link
   sign-in. The membership trigger activates preapproved email addresses.
   For an existing verified `pending` account, manually review and activate
   its membership after confirming ownership.
5. Optionally set the lead's status to `invited` in admin SQL:

```sql
update public.early_access_signups
set status='invited'
where email=lower('invited.person@example.com');
```

## Data rights and privacy handling

The public `#privacy` page accepts requests without requiring a Base account.

Review pending requests:

```sql
select id,created_at,email,request_type
from public.early_access_privacy_requests
where handled_at is null
order by created_at;
```

Contact the person at the recorded address and **verify** that they control
it before you send them data, change it or delete their registration.

After verifying a withdrawal request:

```sql
delete from public.early_access_signups
where email=lower('verified.person@example.com');

update public.early_access_privacy_requests
set handled_at=now()
where id='<verified-request-uuid>';
```

Periodically review aged registrants, honour requests promptly, and maintain
an accurate privacy notice. Set up a real public contact address before
substantial outreach. Do not publish the founder's private/test address
without explicit approval.

## Operational constraints

- No automatic invitations, marketing emails or payment collection.
- No confirmed double opt-in or email ownership check for a registration.
  Invitations should be sent carefully and should identify the sender.
- Simple browser honeypot only. This is **not** robust server-side spam/rate
  limiting. Monitor for abuse and add CAPTCHA/Turnstile and server throttling
  before high-volume promotion.
- GDPR/POPIA compliance is not established by the form alone. Review the
  operator identity, privacy notice, consent records, deletion/retention and
  cross-border data handling before a wider launch.
- On the browser-only preview build, registrations are explicitly unavailable
  rather than silently stored in localStorage.
