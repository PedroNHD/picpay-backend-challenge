import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';
import { PublicUser, UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiCreatedResponse({ description: 'Usuário criado com sucesso' })
  create(@Body() dto: CreateUserDto): Promise<PublicUser> {
    return this.usersService.create(dto);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Detalhes e saldo do usuário' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<PublicUser> {
    return this.usersService.findById(id);
  }
}
