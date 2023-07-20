[//]: # (cURLs in this file are generated from the .http file using http-client.env.json)

# Using Named Subdomains

Named subdomains are _cloned_ in the Gateway, and are thereby backed-up.

To use named subdomains, you first need [an account](accounts.md). (If your Gateway is self-hosted, you can get started with the _root_ account, which was created when the Gateway was first deployed.)

## creating a named domain

A new domain can be created with:

```curl
curl -X PUT --location "https://≪gateway≫/api/v1/domain/≪account name≫/≪subdomain≫" \
    -H "Accept: application/json" \
    --basic --user ≪account name≫:≪account key≫
```

This creates the domain `≪subdomain≫` in the account. Domain names must be composed only of **lowercase** letters, numbers, hyphens `-` and underscores `_`.

The body of the response will contain the configuration to be used in a new **m-ld** clone to connect to the domain, with placeholders for required secrets.

Once created, you can [clone the subdomain](clone-subdomain.md).