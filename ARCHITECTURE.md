# Sistema Fênix — arquitetura e regras de evolução

## Fonte oficial dos dados

O projeto Supabase definido em `SUPABASE_CONFIG` é a fonte oficial de autenticação e dados. A autenticação utiliza somente esse projeto; perfis ausentes ou desconhecidos são recusados, sem consultar a base antiga.

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

1. Concluir e verificar a integração do WhatsApp com o número fixo.
2. Implementar o envio de aniversário com a Fê após ativação e aprovação do modelo.
3. Separar o HTML, os estilos e o JavaScript em arquivos próprios.

Os testes locais cobrem cadastro, edição, persistência e permissões com banco simulado e regras exportadas; não substituem a conferência autenticada do banco de produção. As falhas de sincronização são exibidas e as alterações pendentes são preservadas.
