// Opções do formulário. O `value` é o que vai para o banco (estável para relatórios);
// o `label` é o texto exibido e pode mudar sem afetar os dados já gravados.

export interface Option {
  readonly value: string;
  readonly label: string;
}

export const OBJETIVOS = [
  { value: 'mais_pedidos_orcamento', label: 'Receber mais pedidos de orçamento' },
  { value: 'projetos_maior_valor', label: 'Conquistar projetos de maior valor' },
  { value: 'depender_menos_indicacoes', label: 'Depender menos só de indicações' },
  { value: 'melhorar_presenca_digital', label: 'Melhorar a presença digital' },
  { value: 'comecar_anunciar', label: 'Começar a anunciar' },
  { value: 'melhorar_campanhas', label: 'Melhorar as campanhas atuais' },
] as const satisfies readonly Option[];

export const SERVICOS = [
  { value: 'cozinhas', label: 'Cozinhas planejadas' },
  { value: 'dormitorios_closets', label: 'Dormitórios e closets' },
  { value: 'salas_home_office', label: 'Salas, painéis e home office' },
  { value: 'projetos_completos', label: 'Projetos completos (casa ou apartamento)' },
  { value: 'corporativo_comercial', label: 'Móveis corporativos e comerciais' },
  { value: 'outro', label: 'Outro' },
] as const satisfies readonly Option[];

export const INVESTIMENTOS = [
  { value: 'nao_invisto', label: 'Ainda não invisto em anúncios' },
  { value: 'ate_1000', label: 'Até R$ 1.000 por mês' },
  { value: '1000_3000', label: 'De R$ 1.000 a R$ 3.000 por mês' },
  { value: '3000_5000', label: 'De R$ 3.000 a R$ 5.000 por mês' },
  { value: '5000_10000', label: 'De R$ 5.000 a R$ 10.000 por mês' },
  { value: 'acima_10000', label: 'Acima de R$ 10.000 por mês' },
  { value: 'prefiro_nao_informar', label: 'Prefiro não informar' },
] as const satisfies readonly Option[];

export const CAPACIDADES = [
  { value: 'ate_2', label: 'Até 2 projetos' },
  { value: '3_5', label: 'De 3 a 5 projetos' },
  { value: '6_10', label: 'De 6 a 10 projetos' },
  { value: '11_20', label: 'De 11 a 20 projetos' },
  { value: 'acima_20', label: 'Mais de 20 projetos' },
  { value: 'nao_sei', label: 'Ainda não sei informar' },
] as const satisfies readonly Option[];
