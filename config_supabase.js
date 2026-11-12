/* Conexão do painel ao Supabase (banco em tempo real).
   Preencha com os dados do projeto (Supabase > Project Settings > API):
     url     = "Project URL"  (https://xxxx.supabase.co)
     anonKey = chave "anon / public"  — é pública por desenho; o acesso é protegido por login @kwbrasil.com.br + RLS (supabase/schema.sql).
   NUNCA coloque aqui a chave service_role. Com url vazio o painel segue no modo arquivo sincronizado. */
window.KW_SUPABASE = {
  url: 'https://tglvhbcaarbaorrimcph.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnbHZoYmNhYXJiYW9ycmltY3BoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0NjE5NjIsImV4cCI6MjExMDAzNzk2Mn0.WiOwUKyLVsvQ36AQjHnzNEz4JTGQWL-ET4xlpmcRpy0'
};
