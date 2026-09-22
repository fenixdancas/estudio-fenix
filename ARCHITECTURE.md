# Sistema Fênix — arquitetura e regras de evolução

## Fonte oficial dos dados

O projeto Supabase definido em `SUPABASE_CONFIG` é a fonte oficial de autenticação e dados. O projeto em `LEGACY_SUPABASE_CONFIG` existe apenas como compatibilidade temporária de autenticação e deve ser removido depois que Nahid, Tati e as professoras estiverem criadas no projeto atual.

O `localStorage` é somente contingência temporária e cache do navegador. Ele não pode ser considerado banco oficial nem confirmação de que um cadastro foi salvo remotamente.

## Fluxo obrigatório de uma alteração

1. Alterar o código preservando as funções já aprovadas.
2. Executar `npm run validate`.
3. Conferir login, navegação e a função alterada.
4. Publicar na branch `main` somente após a validação.
5. Conferir a versão publicada no GitHub Pages.

## Regras técnicas

- Não incorporar imagens grandes em Base64 no HTML.
- Não criar uma terceira fonte de dados.
- Não ocultar erros de sincronização como se o salvamento tivesse funcionado.
- Não misturar permissões administrativas e de professoras.
- Não duplicar professoras, turmas ou pessoas por diferenças entre nome completo e apelido.
- Toda tabela exposta ao navegador deve ter políticas RLS no Supabase.
- Chaves administrativas e `service_role` nunca podem aparecer no repositório ou no navegador.

## Próximas etapas estruturais

1. Migrar todos os usuários para o Supabase atual.
2. Remover a autenticação pela base antiga.
3. Tornar falhas de sincronização visíveis na interface.
4. Separar o HTML, os estilos e o JavaScript em arquivos próprios.
5. Acrescentar testes de cadastro, edição, persistência e permissões.
