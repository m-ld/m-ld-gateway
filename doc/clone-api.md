---
layout: doc.liquid
title: clone API
---
# Clone API

Let's say we have an account and a named subdomain. Because we're using [named subdomains](named-subdomains), the Gateway has a clone of the information in the (sub)domain.

Normally in an app using **m-ld**, clients _clone_ the domain locally and manipulate its data directly. However there are a number of reasons a client may not want to do this, such as:
- The client only has occasional need for data;
- It doesn't have enough storage capacity to clone the whole domain;
- No clone engine exists for its platform.

The 'clone' (noun, not verb) API is provided for such a client to access the data remotely over HTTP.

Some data can be added to the domain with:

```
{% include 'http/clone-api/async-write.http' %}
```

Data in the domain can be queried with:

```
{% include 'http/clone-api/async-read.http' %}
```

This example query describes all the subjects in the domain, which is to say, their top-level properties.