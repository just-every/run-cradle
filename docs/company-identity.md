# Signing in with your company identity and SCIM provisioning

The installation owner manages company identity at **Sign-in settings** (`/auth/settings/identity`). Native email sign-in remains available. Company sign-in is off until the owner enables provider sign-in and configures a provider. Existing OIDC linking through Auth continues to work.

For SAML, enter the identity provider’s entity ID, HTTPS SSO URL and PEM signing certificate, enable SAML, and save. Give the provider the metadata at `/auth/saml/metadata`. Use SP-initiated login, an emailAddress NameID matching an existing operator, and a signed Response or Assertion. A stranger receives no session. SCIM can provision the operator before their first login.

The supported signature profile is RSA-SHA256 with SHA-256 digests and exclusive XML canonicalization. Cradle uses pinned `xml-crypto` 6.4.0 and `@xmldom/xmldom` 0.8.15, running in the emitted Worker’s Node compatibility runtime. It consumes the library’s verified signed reference, rejects wrapping and duplicate IDs, and checks issuer, audience, destination, request binding and validity times. The clock allowance is 60 seconds. Requests are browser-bound, expire after five minutes and can be consumed once; assertion IDs cannot be replayed. Configuration changes invalidate outstanding requests and provider sessions.

Issue a SCIM credential from the same panel. Copy it once into your provisioning client; reads never show it again. Cradle stores its SHA-256 hash. Rotation revokes the previous credential, and **Revoke SCIM credential** immediately disables provisioning. Owner role/version changes invalidate their issued credential too.

The SCIM endpoint is `/scim/v2`. It supports ServiceProviderConfig, ResourceTypes, Schemas, and Users: list with `userName eq`, `startIndex` and `count`; get; create; replace; name and active patches; and delete. New people receive the member role with no base grants. Duplicate user names return 409. Changes are audited under the issuing SCIM client’s identity without the bearer value.

Before deprovisioning, transfer active campaign ownership and unresolved decision assignments. A refused removal names the blocking records and changes nothing. Successful deprovisioning ends existing sessions immediately, refuses subsequent company sign-in and preserves attribution on retained work. Provisioning the same person again restores access through the same operator identity; old sessions and removed grants do not return. Erasure removes the SAML binding and SCIM identifier permanently.

Installation archives omit IdP configuration, SCIM credentials, SCIM authentication identifiers, SAML transactions and sessions, just as they omit native/OIDC authentication material. A restored installation starts with company identity inactive; the destination owner must configure it again. Business records retain their attribution.

Proof uses a local signing IdP and synthetic provisioning client at the network edge. **No real IdP was used.** Okta, Microsoft Entra ID and Google Workspace consent/configuration remain owner acceptance steps; local proof does not certify any live tenant.
