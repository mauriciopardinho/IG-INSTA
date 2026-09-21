from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List
from backend.model.manager import model_manager
from backend.memory.manager import memory_manager
from backend.safety.silcarpaty import silcarpaty

router = APIRouter(prefix="/api/chat", tags=["Chatbot"])

class ChatRequest(BaseModel):
    message: str

@router.post("")
def send_chat_message(req: ChatRequest) -> Dict[str, Any]:
    """Endpoint principal do Chatbot de ponta a ponta (CA-1.4)."""
    user_msg = req.message.strip()
    if not user_msg:
        raise HTTPException(status_code=400, detail="Mensagem vazia.")

    # 1. Verificar comando de emergência SilCarPaty (CA-SC-1)
    silcarpaty_res = silcarpaty.process_command(user_msg)
    if silcarpaty_res["triggered"]:
        response_text = f"**[CONTROLE DE EMERGÊNCIA DISPARADO]**\n{silcarpaty_res['message']}"
        memory_manager.record_interaction(user_msg, response_text)
        return {
            "reply": response_text,
            "silcarpaty_event": silcarpaty_res,
            "state": silcarpaty_res["state"]
        }

    # 2. Se SilCarPaty estiver OFF, responder com status interrompido
    if not silcarpaty.is_active():
        response_text = "⚠️ **SISTEMA INTERROMPIDO POR CONTROLE SilCarPaty**\nA evolução e as atividades autônomas estão temporariamente suspensas. Envie a chave 'SilCarPaty' novamente para reativar."
        memory_manager.record_interaction(user_msg, response_text)
        return {"reply": response_text, "state": "OFF"}

    # 3. Gerar resposta via modelo local com contexto de memória (CA-1.3, CA-1.4, CA-2.4)
    context_prompt = memory_manager.get_context_for_prompt(user_msg)
    bot_reply = model_manager.generate(
        prompt=user_msg,
        system_prompt=f"Você é a Plataforma de IA Autônoma Evolutiva operando localmente no hardware do usuário.\n{context_prompt}"
    )

    # 4. Registrar no histórico persistente (CA-1.5)
    memory_manager.record_interaction(user_msg, bot_reply)

    return {
        "reply": bot_reply,
        "state": "ON",
        "model_used": model_manager.get_info()["model_name"]
    }

@router.get("/history")
def get_chat_history() -> List[Dict[str, Any]]:
    """Retorna o histórico persistente de conversas (CA-1.5)."""
    return memory_manager.long_term.get_chat_history(limit=100)
