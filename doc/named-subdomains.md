---
layout: doc.liquid
title: named subdomains
---
# Using Named Subdomains

Named subdomains are _cloned_ in the Gateway, and are thereby backed up.

To use named subdomains, you first need [an account](accounts). (If your Gateway is self-hosted, you can get started with the _root_ account, which was created when the Gateway was first deployed.)

## creating a named domain

A new domain can be created with:

```
{% include 'http/named-subdomains/create.http' %}
```

This creates the domain `≪subdomain≫` in the account. Domain names must be composed only of **lowercase** letters, numbers, hyphens `-` and underscores `_`.

The body of the response will contain the configuration to be used in a new **m-ld** clone to connect to the domain, with placeholders for required secrets.

Once created, you can [clone the subdomain](clone-subdomain).