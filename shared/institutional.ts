export interface ContentSection {
  title: string;
  paragraphs: string[];
  bullets?: string[];
  links?: { label: string; href: string }[];
}
export interface InstitutionalContent {
  eyebrow: string;
  intro: string;
  sections: ContentSection[];
}
export const institutional: Record<string, InstitutionalContent> = {
  "/politica-de-privacidade/": {
    eyebrow: "GEEK MUSICAL",
    intro: "Política de Privacidade",
    sections: [
      {
        title: "Política de Privacidade",
        paragraphs: [
          "A sua privacidade é importante para nós. É política do Geek Musical respeitar a sua privacidade em relação a qualquer informação sua que possamos coletar no site Geek Musical, e outros sites que possuímos e operamos.",
          "Solicitamos informações pessoais apenas quando realmente precisamos delas para lhe fornecer um serviço. Fazemo-lo por meios justos e legais, com o seu conhecimento e consentimento. Também informamos por que estamos coletando e como será usado.",
          "Apenas retemos as informações coletadas pelo tempo necessário para fornecer o serviço solicitado. Quando armazenamos dados, protegemos dentro de meios comercialmente aceitáveis para evitar perdas e roubos, bem como acesso, divulgação, cópia, uso ou modificação não autorizados.",
          "Não compartilhamos informações de identificação pessoal publicamente ou com terceiros, exceto quando exigido por lei.",
          "O nosso site pode ter links para sites externos que não são operados por nós. Esteja ciente de que não temos controle sobre o conteúdo e práticas desses sites e não podemos aceitar responsabilidade por suas respectivas políticas de privacidade.",
          "Você é livre para recusar a nossa solicitação de informações pessoais, entendendo que talvez não possamos fornecer alguns dos serviços desejados.",
          "O uso continuado de nosso site será considerado como aceitação de nossas práticas em torno de privacidade e informações pessoais. Se você tiver alguma dúvida sobre como lidamos com dados do usuário e informações pessoais, entre em contato conosco.",
        ],
      },
      {
        title: "Compromisso do Usuário",
        paragraphs: [
          "O usuário se compromete a fazer uso adequado dos conteúdos e da informação que o Geek Musical oferece no site e com caráter enunciativo, mas não limitativo:",
          "A) Não se envolver em atividades que sejam ilegais ou contrárias à boa fé a à ordem pública; B) Não difundir propaganda ou conteúdo de natureza racista, xenofóbica, jogos de sorte ou azar, qualquer tipo de pornografia ilegal, de apologia ao terrorismo ou contra os direitos humanos; C) Não causar danos aos sistemas físicos (hardwares) e lógicos (softwares) do Geek Musical, de seus fornecedores ou terceiros, para introduzir ou disseminar vírus informáticos ou quaisquer outros sistemas de hardware ou software que sejam capazes de causar danos anteriormente mencionados.",
        ],
      },
      {
        title: "Mais informações",
        paragraphs: [
          "Esperemos que esteja esclarecido e, como mencionado anteriormente, se houver algo que você não tem certeza se precisa ou não, geralmente é mais seguro deixar os cookies ativados, caso interaja com um dos recursos que você usa em nosso site.",
          "Esta política é efetiva a partir de 16/02/2024.",
        ],
      },
      {
        title: "Dados tratados no portal editorial",
        paragraphs: [
          "A nova aplicação processa dados técnicos de conexão e registros de acesso para servir as páginas, proteger a administração e investigar erros. Administradores utilizam cookies necessários de sessão; a preferência de tema é armazenada no navegador.",
          "A medição de audiência e os anúncios de terceiros estão desativados na nova aplicação. Caso uma integração de audiência seja habilitada, seu carregamento depende da configuração própria do Geek Musical e do consentimento correspondente.",
          "Links afiliados encaminham você às lojas, que podem usar cookies e tratar dados conforme suas políticas. O Geek Musical não recebe seus dados de pagamento e não processa compras.",
          "O formulário de contato e as Web Stories continuam sendo atendidos pela instalação WordPress preservada e pelos serviços nela configurados. Utilize a página de Contato para perguntas sobre seus dados, pedidos de acesso, correção ou exclusão, observados os requisitos legais aplicáveis.",
        ],
      },
    ],
  },
  "/termos-de-uso/": {
    eyebrow: "GEEK MUSICAL",
    intro: "Termos de Uso",
    sections: [
      {
        title: "Termos de Uso",
        paragraphs: [
          "Termos",
          "Ao acessar ao site Geek Musical, concorda em cumprir estes termos de uso, todas as leis e regulamentos aplicáveis e concorda que é responsável pelo cumprimento de todas as leis locais aplicáveis. Se você não concordar com algum desses termos, está proibido de usar ou acessar este site. Os materiais contidos neste site são protegidos pelas leis de direitos autorais e marcas comerciais aplicáveis.",
        ],
      },
      {
        title: "2. Uso de Licença",
        paragraphs: [
          "É concedida permissão para baixar temporariamente uma cópia dos materiais (informações ou software) no site Geek Musical , apenas para visualização transitória pessoal e não comercial. Esta é a concessão de uma licença, não uma transferência de título e, sob esta licença, você não pode:",
          "modificar ou copiar os materiais; usar os materiais para qualquer finalidade comercial ou para exibição pública (comercial ou não comercial); tentar descompilar ou fazer engenharia reversa de qualquer software contido no site Geek Musical; remover quaisquer direitos autorais ou outras notações de propriedade dos materiais; ou transferir os materiais para outra pessoa ou 'espelhe' os materiais em qualquer outro servidor.",
          "Esta licença será automaticamente rescindida se você violar alguma dessas restrições e poderá ser rescindida por Geek Musical a qualquer momento. Ao encerrar a visualização desses materiais ou após o término desta licença, você deve apagar todos os materiais baixados em sua posse, seja em formato eletrónico ou impresso.",
        ],
      },
      {
        title: "3. Isenção de responsabilidade",
        paragraphs: [
          "Os materiais no site da Geek Musical são fornecidos 'como estão'. Geek Musical não oferece garantias, expressas ou implícitas, e, por este meio, isenta e nega todas as outras garantias, incluindo, sem limitação, garantias implícitas ou condições de comercialização, adequação a um fim específico ou não violação de propriedade intelectual ou outra violação de direitos. Além disso, o Geek Musical não garante ou faz qualquer representação relativa à precisão, aos resultados prováveis ou à confiabilidade do uso dos materiais em seu site ou de outra forma relacionado a esses materiais ou em sites vinculados a este site.",
        ],
      },
      {
        title: "4. Limitações",
        paragraphs: [
          "Em nenhum caso o Geek Musical ou seus fornecedores serão responsáveis por quaisquer danos (incluindo, sem limitação, danos por perda de dados ou lucro ou devido a interrupção dos negócios) decorrentes do uso ou da incapacidade de usar os materiais em Geek Musical, mesmo que Geek Musical ou um representante autorizado da Geek Musical tenha sido notificado oralmente ou por escrito da possibilidade de tais danos. Como algumas jurisdições não permitem limitações em garantias implícitas, ou limitações de responsabilidade por danos conseqüentes ou incidentais, essas limitações podem não se aplicar a você.",
        ],
      },
      {
        title: "5. Precisão dos materiais",
        paragraphs: [
          "Os materiais exibidos no site da Geek Musical podem incluir erros técnicos, tipográficos ou fotográficos. Geek Musical não garante que qualquer material em seu site seja preciso, completo ou atual. Geek Musical pode fazer alterações nos materiais contidos em seu site a qualquer momento, sem aviso prévio. No entanto, Geek Musical não se compromete a atualizar os materiais.",
        ],
      },
      {
        title: "6. Links",
        paragraphs: [
          "O Geek Musical não analisou todos os sites vinculados ao seu site e não é responsável pelo conteúdo de nenhum site vinculado. A inclusão de qualquer link não implica endosso por Geek Musical do site. O uso de qualquer site vinculado é por conta e risco do usuário.",
        ],
      },
      {
        title: "Modificações",
        paragraphs: [
          "O Geek Musical pode revisar estes termos de serviço do site a qualquer momento, sem aviso prévio. Ao usar este site, você concorda em ficar vinculado à versão atual desses termos de serviço.",
        ],
      },
      {
        title: "Conteúdo editorial e links comerciais",
        paragraphs: [
          "O Geek Musical publica informações sobre música, instrumentos e equipamentos. Recomendações editoriais não substituem a consulta às especificações do fabricante nem garantem adequação a todo contexto de uso.",
          "Links de afiliados podem gerar comissão para o portal. Preços, disponibilidade, frete, garantia e condições de compra são definidos pelas lojas e devem ser consultados no destino. A presença de um link não constitui um teste físico do produto.",
          "Textos históricos preservam seu contexto e suas datas. Correções podem ser solicitadas pela página de Contato. O uso do portal está sujeito à legislação brasileira aplicável.",
        ],
      },
    ],
  },
  "/sobre/": {
    eyebrow: "GEEK MUSICAL",
    intro: "Música, instrumentos e informação para a sua jornada.",
    sections: [
      {
        title: "O portal",
        paragraphs: [
          "O Geek Musical reúne reviews, rankings, guias de compra e aprendizado musical para músicos iniciantes, estudantes, produtores e quem quer conhecer melhor seus instrumentos.",
          "O portal foi criado por Daniel, conforme o texto institucional original. O acervo reúne conteúdos sobre violão, guitarra, baixo, teclados, percussão, áudio e outros temas musicais.",
        ],
      },
      {
        title: "Como tratamos o conteúdo",
        paragraphs: [
          "Os artigos preservam suas datas originais. Uma recomendação editorial não significa que realizamos um teste físico: quando houver teste, seu contexto e suas evidências devem estar identificados no artigo.",
          "Informações podem mudar ou depender de versão, fabricante e mercado. Confira o modelo exato e as especificações oficiais antes de comprar. Correções e sugestões podem ser enviadas pela página de Contato.",
        ],
      },
      {
        title: "Como o portal é financiado",
        paragraphs: [
          "Alguns links são afiliados e podem gerar comissão por compras qualificadas. Mantemos divulgação dessa relação e identificamos os destinos comerciais. Leia nossa declaração de afiliados para entender as parcerias.",
        ],
      },
    ],
  },
  "/affiliate-disclosure/": {
    eyebrow: "TRANSPARÊNCIA",
    intro: "Como funcionam os links de afiliados do Geek Musical.",
    sections: [
      {
        title: "Parcerias comerciais",
        paragraphs: [
          "Podemos receber comissão por compras qualificadas realizadas através dos links de afiliados, sem custo adicional para você. Como associado da Amazon, ganhamos com compras qualificadas.",
          "O portal mantém links para Amazon, Mercado Livre, Shopee e parceiros presentes no acervo histórico. A comissão não determina a posição de um produto em um ranking. A decisão de compra e a confirmação do modelo, preço e condições devem ser realizadas na loja.",
        ],
      },
    ],
  },
  "/politica-editorial/": {
    eyebrow: "EDITORIAL",
    intro:
      "Critérios para publicar, preservar e corrigir informações musicais.",
    sections: [
      {
        title: "Fontes e evidências",
        paragraphs: [
          "Especificações devem corresponder ao modelo e à variante descritos. Priorize documentação do fabricante, manuais e fontes identificadas. Alegações de teste físico exigem registro do teste; não deduzimos testes a partir de material de terceiros.",
          "Rankings expressam escolhas editoriais no contexto e na data do artigo. A comissão de afiliados não constitui evidência de qualidade e não deve determinar sua ordem.",
        ],
      },
      {
        title: "Preservação e correções",
        paragraphs: [
          "O acervo histórico mantém URL, autoria, datas e profundidade. Correções factuais precisam registrar o trecho alterado, o motivo, a fonte e a data real da consulta.",
          "Dúvidas sem fonte suficiente permanecem como pendências verificáveis. Não atualizamos anos, datas ou produtos automaticamente. Solicite correções pela página de Contato.",
        ],
      },
    ],
  },
  "/politica-de-cookies/": {
    eyebrow: "PRIVACIDADE",
    intro: "Armazenamento necessário e opções de privacidade.",
    sections: [
      {
        title: "Preferências e sessões",
        paragraphs: [
          "O navegador pode guardar sua escolha de tema e de preferências. A administração utiliza cookies de sessão restritos e necessários para autenticação e segurança.",
          "A medição de audiência está desativada na aplicação inicial. Quando habilitada, seu carregamento respeita a configuração e o consentimento correspondente. As lojas de destino e o WordPress legado podem utilizar serviços próprios, descritos nas respectivas políticas.",
        ],
      },
    ],
  },
  "/transparencia-afiliados/": {
    eyebrow: "TRANSPARÊNCIA",
    intro: "Informações sobre as parcerias comerciais.",
    sections: [
      {
        title: "Links afiliados",
        paragraphs: [
          "Podemos receber comissão por compras qualificadas nos links indicados. A loja determina preços, estoque e condições. Confirme o modelo e as condições na página de compra.",
        ],
      },
    ],
  },
};
