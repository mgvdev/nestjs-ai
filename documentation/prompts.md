# Prompt registry

Register named, versioned prompt templates and render them with `{{var}}`
interpolation.

## Register

```ts
AiModule.forRoot({
  prompts: [
    { name: 'support', version: 'v1', template: 'Help {{user}} with {{topic}}.' },
    { name: 'support', version: 'v2', template: 'Assist {{user}} regarding {{topic}}.' },
  ],
});
```

Also via `AiModule.forFeature({ prompts })`, or imperatively:

```ts
this.prompts.register({ name: 'greeting', template: 'Hi {{name}}!' });
```

## Render

```ts
this.prompts.render('support', { user: 'Ada', topic: 'billing' });
// latest version by default; pass { version: 'v1' } to pin
this.prompts.render('support', { user: 'Ada', topic: 'billing' }, { version: 'v1' });
```

Unknown variables throw, so typos are caught early. Duplicate `(name, version)`
registration throws.

## Use as an agent's system prompt

Resolve the system prompt per call from the registry:

```ts
await agent.run(question, {
  systemPrompt: { name: 'support', vars: { user, topic }, version: 'v2' },
});
```

This overrides the agent's static `system`.

## API

- `register(def)` / `registerAll(defs)`
- `render(name, vars?, { version? })`
- `get(name, version?)` — the raw `PromptDefinition`
- `has(name)`
