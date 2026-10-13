# Scope and evidence boundaries

## Public candidate

This repository now includes a newly authored runnable demonstration of carousel lifecycle and accessible interaction policy. The demo is intentionally narrow: it is a standalone state machine, browser adapter, synthetic HTML/CSS review surface and deterministic tests.

## Relationship to the documented project

The original private project covered broader Shopify product-storytelling and comparison-section work. The public demo illustrates one engineering mechanism relevant to that work, but it is not copied theme code and does not claim source equivalence. Retained private evidence is not redistributed.

## Included

- Original dependency-free JavaScript lifecycle model and fake scheduler.
- Original CSS illustrations and illustrative feature copy.
- Unit tests for timer, pause, navigation, replacement and disposal behavior.
- English engineering documentation and a loopback static server.

## Excluded and not claimed

- No client source, names, domains, product claims, photography, datasets or private preview links.
- No Liquid section schema, Shopify APIs, Theme Editor event implementation, store credentials or deployment workflow.
- No claim that the public demo is a full theme engine, production deployment, complete accessibility certification or performance benchmark.
- No grant concerning private implementation or third-party materials; this candidate contains only newly written showcase material.

## Evidence levels

Passing local unit tests demonstrate the documented pure-model behavior in the tested Node.js environment. A browser review can demonstrate the adapter and responsive interface on the served static page. Neither result by itself proves behavior in a Shopify storefront or its Theme Editor. Those integrations remain explicitly unimplemented.
