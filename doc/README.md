# m-ld Gateway Documentation

This `doc` folder forms the basis of the **m-ld** Gateway public documentation.

The folder is built using Eleventy to the `_site` folder, and then served by the running Gateway in the class `GatewayWebsite`.

All files are treated as Liquid templates. They are processed once by Eleventy, and then _again_ by the gateway – hence the occasional use of double-encoded template tags such as `{{ '{{ origin }}' }}` for per-deployment information.