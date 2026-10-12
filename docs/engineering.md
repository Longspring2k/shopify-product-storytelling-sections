# Engineering decisions

Shopify Product Storytelling Sections

## Schema-backed content

Represent repeated comparison rows as native blocks rather than hard-coded marketing text.

## Composition stays native

Extend the product template without replacing the platform's core product surface.

## Interaction beyond the happy path

Include wraparound, repeated clicks, thumbnail selection and keyboard navigation in the verification design.

## Reading the architecture

Merchant section settings → Liquid semantic markup → Responsive CSS → Carousel state and controls → Product page

The diagram reduces the implementation to its relevant responsibilities. It does not expose private endpoints, exact deployment layout, resource identifiers or operational configuration.
