import { expect,it,vi } from "vitest";
import { render,screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StaffAccess } from "../src/components/staff-access";

const navigation=vi.hoisted(()=>({push:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>navigation}));

it("inicia una sesión demo y presenta los tres alcances autorizados",async()=>{
  const user=userEvent.setup();
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({session:{}})}));
  render(<StaffAccess/>);
  expect(screen.getByRole("heading",{name:"Espacio del personal autorizado"})).toBeTruthy();
  await user.click(screen.getByRole("button",{name:/Supervisorsupervisor\.red/}));
  expect((screen.getByLabelText("Usuario") as HTMLInputElement).value).toBe("supervisor.red");
  await user.type(screen.getByLabelText("Contraseña"),"Demo-RAP-2026!");
  await user.click(screen.getByRole("button",{name:/Ingresar de forma segura/}));
  expect(fetch).toHaveBeenCalledWith("/api/auth/login",expect.objectContaining({method:"POST"}));
  expect(navigation.push).toHaveBeenCalledWith("/tecnico");
  expect(screen.getAllByRole("article")).toHaveLength(3);
});

it("muestra un error de credenciales sin navegar",async()=>{
  const user=userEvent.setup();navigation.push.mockReset();
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,json:async()=>({message:"Usuario o contraseña incorrectos."})}));
  render(<StaffAccess/>);await user.click(screen.getByRole("button",{name:/Técnico N1tecnico\.n1/}));
  await user.type(screen.getByLabelText("Contraseña"),"credencial-invalida");
  await user.click(screen.getByRole("button",{name:/Ingresar de forma segura/}));
  expect((await screen.findByRole("alert")).textContent).toContain("Usuario o contraseña incorrectos.");
  expect(navigation.push).not.toHaveBeenCalled();
});
