# Modelos WhatsApp — 24/10/2026

Consulta autenticada confirmou aprovação Utility dos três modelos de mensalidade e de `fenix_confirmacao_experimental_card_curto`.

Apps Script: implantação existente atualizada para versão 27, preservando URL e permissões. Em Código.gs, a chamada de sendWhatsApp_ passou de whatsappPayload_ para whatsappPayloadAprovado_. O módulo `integrations/modelos-aprovados.gs` fornece o roteamento e mantém compatibilidade com os modelos anteriores.

A confirmação curta usa somente o parâmetro de imagem. O corpo fixo aprovado pede confirmação/reagendamento; os dados ficam na imagem gerada para a aula.

Os quatro testes de transporte para Nahid foram aceitos pela Meta às 09h41. Nahid confirmou recebimento e apontou repetição da legenda nas mensalidades. Novas versões somente com nome foram solicitadas, sem trocar modelos de produção enquanto não forem aceitas.

O suporte de cobrança consulta a mensalidade e a aluna atuais com autenticação administrativa antes de montar o envio; recusa pagas, canceladas, negociadas, valor zero, inativas, matrículas excluídas, destino divergente e fase incorreta. As fases previstas são véspera, vencimento e terceiro dia de atraso. Isso ainda não constitui uma automação diária: não foi criado acionador e não houve envio para alunas reais.

Validação: 107 testes, incluindo seis cenários de modelos/cobrança; UI em desktop e celular sem erros.
