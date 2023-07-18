# Accounts

Accounts have two purposes in the **m-ld** Gateway.
1. To represent human and machine users. For this purpose, users and machines will get _keys_, which can include asymmetric keys for digital signatures. Note that registering all users as individual accounts is optional, and apps can be built using the Gateway having only one "app" account and key, with the app's users managed by the app itself.
2. To provide a container for **m-ld** domains. Domains belong to an account, which contributes its name to the domain's name. That's why domains in the Gateway are sometimes called "subdomains". Subdomains can be [_named_](named-subdomains.md) – the domain is first created in the Gateway and is backed-up there; or have [_UUID_ identifiers](uuid-subdomains.md) – in which case the Gateway only provides message delivery.

To create an account you can use an activation code, or (if the Gateway is self-hosted) the root account.

Account names (`my-account` in the below) must be composed only of **lowercase** letters, numbers, hyphens `-` and underscores `_`.

## creating an account with an activation code

First, request an activation code with an email address.

```http request
POST http://my-gateway/api/v1/user/my-account/activation
Accept: application/json

{ "email": "my-email@ex.org" }
```

The body of the response will have the form `{ "jwe": "≪base64Binary≫" }"`. The value of the `jwe` key will be used in the next step.

An email will be sent to the given address, containing a six-digit activation code.

The account can then be created with another HTTP request:

```http request
POST http://my-gateway/api/v1/user/my-account/key
Authorization: Bearer ≪jwe≫
X-Activation-Code: ≪emailed activation code≫
Accept: application/json

// Empty body
```

The body of the response will be of the form `{ "auth": { "key": "≪my-key≫" } }`, where `≪my-key≫` is the new account's authorisation key.

## creating an account with the root

The Gateway root account can be used to create any user account directly.

```http request
POST http://my-gateway/api/v1/user/my-account/key
Authorization: Basic ≪root-key≫
Accept: application/json

// Empty body
```

The body of the response will be of the form `{ "auth": { "key": "≪my-key≫" } }`, where `≪my-key≫` is the new account's authorisation key.
