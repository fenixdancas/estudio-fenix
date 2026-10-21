# Card da Fê no WhatsApp

Implementação preparada; publicação no Apps Script e aprovação na Meta ainda não verificadas.
Não publicar o frontend desta alteração antes das verificações abaixo. O frontend atual continua usando o modelo de texto.

## Modelo separado na Meta

Nome: `fenix_confirmacao_experimental_card`; idioma: `pt_BR`; categoria solicitada: `UTILITY`.
Cabeçalho: imagem. Usar um card com dados fictícios como exemplo de aprovação.
Corpo com os mesmos quatro parâmetros do modelo existente, nesta ordem: nome, modalidade, data, horário.
Texto proposto:

> Olá, {{1}}! Sua aula experimental de {{2}} no Estúdio de Danças Fênix está agendada para {{3}}, às {{4}}. Você confirma sua presença? Responda Confirmo para confirmar ou Reagendar para solicitar outra data.

A nova integração não altera o modelo existente nem o processamento das respostas.

## Publicação

1. Atualizar no Apps Script as funções de `integrations/whatsapp-fixo.gs`, preservando o restante do backend. O `sendWhatsApp_` deve continuar chamando `whatsappPayload_(p, to, message)` e repassar `p.card_base64` sem removê-lo antes dessa chamada. Conferir o código completo do projeto antes de editar.
2. Executar `validarCardExperimentalFenix()` e confirmar aprovação, categoria e cabeçalho de imagem. A função não envia mensagens.
3. Publicar uma versão nova na implantação existente do Apps Script, preservando a URL configurada no sistema.
4. Publicar esta alteração de frontend somente após o backend e o modelo estarem prontos.
5. Enviar uma aula de teste para um destinatário explicitamente escolhido. Confirmar imagem, cinco campos, endereço 59, histórico e processamento da resposta. Aceitação da Meta não comprova entrega: acompanhar o webhook em Entregas do WhatsApp.

O navegador gera o JPEG a partir dos dados atuais da aula e o envia apenas ao Apps Script autenticado. O backend valida o modelo e carrega o JPEG no endpoint `/media` da Meta. O id retornado compõe o cabeçalho do template; nenhum card com dados pessoais vai para o GitHub ou Drive. O histórico mantém a identificação da aula e não armazena o Base64. A implementação bloqueia erros de upload sem repetir automaticamente nem trocar por mensagem de texto.

## Validação local

`npm run validate`, `npm test` e `npm run test:ui`.
Os testes usam dados fictícios e APIs simuladas; não comprovam implantação ou aprovação na conta Meta.
