# Home-manager module for WhisperSM speech-to-text
#
# Provides a systemd user service for autostart.
# Usage: imports = [ whispersm.homeManagerModules.default ];
#        services.whispersm.enable = true;
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.whispersm;
in
{
  options.services.whispersm = {
    enable = lib.mkEnableOption "WhisperSM speech-to-text user service";

    package = lib.mkOption {
      type = lib.types.package;
      defaultText = lib.literalExpression "whispersm.packages.\${system}.whispersm";
      description = "The WhisperSM package to use.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.user.services.whispersm = {
      Unit = {
        Description = "WhisperSM speech-to-text";
        After = [ "graphical-session.target" ];
        PartOf = [ "graphical-session.target" ];
      };
      Service = {
        ExecStart = "${cfg.package}/bin/whispersm";
        Restart = "on-failure";
        RestartSec = 5;
      };
      Install.WantedBy = [ "graphical-session.target" ];
    };
  };
}
