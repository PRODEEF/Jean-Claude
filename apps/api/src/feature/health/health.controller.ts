import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { LLM_PROVIDER, type LlmProvider } from "../../core/llm/llm.port";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider) {}

  @Get()
  @ApiOperation({ summary: "État du service et moteur IA actif" })
  check(): { status: string; llm: { provider: string; sovereign: boolean } } {
    return {
      status: "ok",
      // Exposer la souveraineté du moteur permet aux clients de l'afficher
      // à l'utilisateur, comme demandé au §5.1 et au §13.4.6.
      llm: { provider: this.llm.name, sovereign: this.llm.isSovereign },
    };
  }
}
