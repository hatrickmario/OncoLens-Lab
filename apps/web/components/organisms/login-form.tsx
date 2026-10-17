export interface TextosLogin {
  correo: string;
  contrasena: string;
  enviar: string;
  enviando: string;
  errorCredenciales: string;
}

export interface LoginFormProps {
  homePath: string;
  textos: TextosLogin;
}

// Esqueleto del commit en rojo (US-211): sin comportamiento todavía.
export function LoginForm(props: LoginFormProps) {
  void props;
  return null;
}
